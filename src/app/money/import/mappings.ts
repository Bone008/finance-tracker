import * as moment from "moment";
import { escapeRegex } from "src/app/core/util";
import { google } from "src/proto/model";
import { momentToTimestamp, numberToMoney } from "../../core/proto-util";
import { FormatMapping, FormatMappingBuilder } from "./format-mapping";

const ALL_FILE_FORMATS_INTERNAL = [
  'ksk_camt',
  'ksk_creditcard',
  'mlp',
  'dkb',
  'ubs',
  'deutsche_bank',
  'ing',
  'n26',
  'wise',
  'generic_en',
  'vimpay',
  'paypal_de',
  'paypal_en',
  'revolut',
] as const;

export const ALL_FILE_FORMATS: readonly string[] = ALL_FILE_FORMATS_INTERNAL;
export type ImportFileFormat = typeof ALL_FILE_FORMATS_INTERNAL[number];

/** Date formats accepted by parseDate. See: https://momentjs.com/docs/#/parsing/string-format/ */
const ACCEPTED_DATE_FORMATS = ['YYYY-MM-DD', 'DD.MM.YYYY', 'DD.MM.YY', 'DD-MM-YYYY'];

/** Dictionary that contains configurations for each supported import format. */
export const MAPPINGS_BY_FORMAT: { [K in ImportFileFormat]: FormatMapping } = {
  'ksk_camt': new FormatMappingBuilder<KskCamtRow>()
    .addMapping("date", "Valutadatum", parseDate)
    .addMapping("amount", "Betrag", parseAmount)
    .addMapping("reason", "Verwendungszweck")
    .addMapping("who", "Beguenstigter/Zahlungspflichtiger")
    .addMapping("whoIdentifier", "Kontonummer/IBAN")
    .addMapping("bookingText", "Buchungstext")
    .build(),

  'ksk_creditcard': new FormatMappingBuilder<KskCreditcardRow>()
    .addMapping("date", "Belegdatum", parseDate)
    .addMapping("amount", "Buchungsbetrag", parseAmount)
    .addMapping("who", "Transaktionsbeschreibung Zusatz")
    .addConstantMapping("bookingText", "KREDITKARTE")
    .addRawMapping("reason", ["Transaktionsbeschreibung"], row => {
      const components: string[] = [];
      components.push(row["Transaktionsbeschreibung"]);
      if (row["Originalwährung"] !== row["Buchungswährung"]) {
        let originalAmount = row["Originalbetrag"];
        // Fix for JPY being incorrectly represented.
        if (row["Originalwährung"] === "JPY" && originalAmount.match(/,\d\d$/)) {
          originalAmount = originalAmount.replace(",", "");
        }

        components.push(originalAmount + " " + row["Originalwährung"]);
      }

      return components.filter(comp => comp).join("; ");
    })
    .build(),

  'mlp': new FormatMappingBuilder<MlpRow>()
    .skipUntilPattern(/^"Buchungstag";"Valuta";"Auftraggeber/m)
    .addMapping("date", "Valuta", parseDate)
    .addMapping("reason", "Vorgang/Verwendungszweck", input => input.replace('\n', ''))
    .addMapping("who", "Empfänger/Zahlungspflichtiger")
    .addMapping("whoIdentifier", "IBAN")
    .addRawMapping("amount", ["Umsatz", " "], row => {
      const absAmount = parseAmount(row["Umsatz"]);
      const type = row[" "];
      if (type === 'S') {
        absAmount.units *= -1;
        absAmount.subunits *= -1;
      } else if (type !== 'H') {
        throw new Error('Unknown amount type value, expected H or S: ' + type);
      }
      return absAmount;
    })
    .build(),

  'dkb': new FormatMappingBuilder<DkbRow>()
    .skipUntilPattern(/^"Buchungstag";"Wertstellung";/m)
    .addMapping("date", "Wertstellung", parseDate)
    .addMapping("reason", "Verwendungszweck")
    .addMapping("who", "Auftraggeber / Begünstigter")
    .addMapping("whoIdentifier", "Kontonummer")
    .addMapping("amount", "Betrag (EUR)", parseAmount)
    .addMapping("bookingText", "Buchungstext")
    .build(),

  'ubs': new FormatMappingBuilder<UbsRow>()
    .addMapping("date", "Abschluss", parseDate)
    .addMapping("reason", "Beschreibung 3")
    .addMapping("who", "Beschreibung 2")
    .addMapping("bookingText", "Beschreibung 1")
    .addRawMapping("amount", ['Belastung', 'Gutschrift'], row => {
      const expense = row['Belastung'];
      const income = row['Gutschrift'];
      if (!expense && !income) {
        throw new Error('found neither "Belastung" nor "Gutschrift"');
      }
      const amount = parseAmount(expense || income, "'", ".");
      if (expense) {
        amount.units *= -1;
        amount.subunits *= -1;
      }
      return amount;
    })
    .build(),

  'deutsche_bank': new FormatMappingBuilder<DeutscheBankRow>()
    .skipUntilPattern(/^Buchungstag;Wert;Umsatzart;/m)
    .setRowFilter(row => row['Buchungstag'] !== 'Kontostand')
    .addMapping("date", "Wert", parseDate)
    .addMapping("reason", "Verwendungszweck")
    .addMapping("who", "Begünstigter / Auftraggeber")
    .addMapping("whoIdentifier", "IBAN")
    .addMapping("bookingText", "Umsatzart")
    .addRawMapping("amount", ["Soll", "Haben"], row => {
      const expense = row["Soll"];
      const income = row["Haben"];
      if (!expense && !income) {
        throw new Error('found neither "Soll" nor "Haben"');
      }
      return parseAmount(expense || income);
    })
    .build(),

  'ing': new FormatMappingBuilder<IngRow>()
    .skipUntilPattern(/^Buchung;Valuta;/m)
    .addMapping("date", "Valuta", parseDate)
    .addMapping("reason", "Verwendungszweck")
    .addMapping("who", "Auftraggeber/Empfänger")
    .addMapping("amount", "Betrag", parseAmount)
    .addMapping("bookingText", "Buchungstext")
    .build(),

  'n26': new FormatMappingBuilder<N26Row>()
    .addMapping("date", "Datum", parseDate)
    .addMapping("reason", "Verwendungszweck")
    .addMapping("who", "Empfänger")
    .addMapping("whoIdentifier", "Kontonummer")
    .addMapping("amount", "Betrag (EUR)", row => parseAmount(row, ",", "."))
    .addMapping("bookingText", "Kategorie")
    .build(),

  'wise': new FormatMappingBuilder<WiseRow>()
    .addMapping("date", "Date", parseDate)
    .addRawMapping("reason", ["Description"], row => {
      const description = row["Description"];
      // Slight cleanup to avoid redundancy.
      if (description.match(/^Card transaction of .+? issued by /)) {
        return "Card transaction";
      }
      return description;
    })
    .addRawMapping("who", ["Payee Name", "Merchant"], row => {
      const payeeName = row["Payee Name"];
      const merchant = row["Merchant"];
      return payeeName + (payeeName && merchant ? "; " : "") + merchant;
    })
    .addMapping("whoIdentifier", "Payee Account Number")
    .addMapping("amount", "Amount", row => parseAmount(row, ",", "."))
    .addMapping("bookingText", "TransferWise ID")
    .addMapping("comment", "Note") // Actually only user-supplied.
    .build(),

  'generic_en': new FormatMappingBuilder<GenericEngRow>()
    .addMapping("date", "Date", parseDate)
    .addMapping("reason", "Description")
    .addMapping("amount", "Amount", parseAmount)
    .addMapping("who", "Who")
    .addMapping("whoIdentifier", "Who Identifier")
    .addMapping("bookingText", "Booking Text")
    .build(),

  'vimpay': new FormatMappingBuilder<VimPayRow>()
    .addMapping("date", "Date", parseDate)
    .addMapping("reason", "Reference")
    .addMapping("amount", "Amount", row => parseAmount(row, ",", "."))
    .addMapping("who", "Remitter / Recipient")
    .addMapping("whoIdentifier", "IBAN of the remitter / recipient")
    .build(),

  'paypal_en': new FormatMappingBuilder<PaypalEnglishRow>()
    .addMapping("date", "Date", parseDate)
    .addMapping("reason", "Description")
    .addMapping("amount", "Gross", parseAmount)
    .addRawMapping("who", ["Name"], row => row["Name"] || row["Bank Name"])
    .addMapping("whoIdentifier", "From Email Address")
    .addMapping("bookingText", "Reference Txn ID")
    .build(),

  'paypal_de': new FormatMappingBuilder<PaypalGermanRow>()
    .addMapping("date", "Datum", parseDate)
    .addMapping("reason", "Beschreibung")
    .addMapping("amount", "Brutto", parseAmount)
    .addRawMapping("who", ["Name"], row => row["Name"] || row["Name der Bank"])
    .addMapping("whoIdentifier", "Absender E-Mail-Adresse")
    .addMapping("bookingText", "Zugehöriger Transaktionscode")
    .build(),

  'revolut': new FormatMappingBuilder<RevolutRow>()
    // Convert date from full ISO 8601 to just the date part.
    .addMapping("date", "Started Date", rawValue => parseDate(rawValue.split(' ')[0]))
    .addMapping("reason", "Description")
    .addMapping("amount", "Amount")
    .addMapping("bookingText", "Type")
    .build()
};

function parseDate(rawValue: string): google.protobuf.Timestamp {
  if (rawValue === '') {
    throw new Error('Could not parse empty date!');
  }
  const parsed = moment(rawValue, ACCEPTED_DATE_FORMATS, true);
  if (!parsed.isValid()) {
    throw new Error("Could not parse date: " + rawValue);
  }
  return momentToTimestamp(parsed);
}

function parseAmount(rawValue: string, groupingSep = ".", decimalSep = ",") {
  let cleanedValue = rawValue;
  if (groupingSep) {
    cleanedValue = cleanedValue.replace(new RegExp(escapeRegex(groupingSep), "g"), "");
  }
  if (decimalSep) {
    cleanedValue = cleanedValue.replace(new RegExp(escapeRegex(decimalSep), "g"), ".");
  }
  const num = Number(cleanedValue);
  if (isNaN(num)) throw new Error("could not parse amount: " + rawValue + " / " + cleanedValue);
  return numberToMoney(num);
}

interface KskCamtRow {
  Auftragskonto: string;
  "Auslagenersatz Ruecklastschrift": string;
  "BIC (SWIFT-Code)": string;
  "Beguenstigter/Zahlungspflichtiger": string;
  Betrag: string;
  Buchungstag: string;
  Buchungstext: string;
  "Glaeubiger ID": string;
  Info: string;
  "Kontonummer/IBAN": string;
  "Kundenreferenz (End-to-End)": string;
  "Lastschrift Ursprungsbetrag": string;
  Mandatsreferenz: string;
  Sammlerreferenz: string;
  Valutadatum: string;
  Verwendungszweck: string;
  Waehrung: string;
}

interface KskCreditcardRow {
  "Umsatz getätigt von": string;
  "Belegdatum": string;
  "Buchungsdatum": string;
  "Originalbetrag": string;
  "Originalwährung": string;
  "Umrechnungskurs": string;
  "Buchungsbetrag": string;
  "Buchungswährung": string;
  "Transaktionsbeschreibung": string;
  "Transaktionsbeschreibung Zusatz": string;
  "Buchungsreferenz": string;
  "Gebührenschlüssel": string;
  "Länderkennzeichen": string;
  "BAR-Entgelt+Buchungsreferenz": string;
  "AEE+Buchungsreferenz": string;
  "Abrechnungskennzeichen": string;
}

interface MlpRow {
  "Buchungstag": string;
  "Valuta": string;
  "Auftraggeber/Zahlungsempfänger": string;
  "Empfänger/Zahlungspflichtiger": string;
  "Konto-Nr.": string;
  "IBAN": string;
  "BLZ": string;
  "BIC": string;
  "Vorgang/Verwendungszweck": string;
  "Kundenreferenz": string;
  "Währung": string;
  "Umsatz": string;
  " ": string;
}

interface DkbRow {
  "Buchungstag": string;
  "Wertstellung": string;
  "Buchungstext": string;
  "Auftraggeber / Begünstigter": string;
  "Verwendungszweck": string;
  "Kontonummer": string;
  "BLZ": string;
  "Betrag (EUR)": string;
  "Gläubiger-ID": string;
  "Mandatsreferenz": string;
  "Kundenreferenz": string;
}

interface UbsRow {
  // The first fields are only about the account that was exported from.
  // They are joined with the actual transactions and the same in every row.
  "Bewertungsdatum": string;
  "Bankbeziehung": string;
  "Portfolio": string;
  "Produkt": string;
  "IBAN": string;
  "Whrg.": string;
  "Datum von": string;
  "Datum bis": string;
  "Beschreibung": string;

  // The following fields relate to the actual transaction.
  "Abschluss": string;
  "Buchungsdatum": string;
  "Valuta": string;
  "Beschreibung 1": string;
  "Beschreibung 2": string;
  "Beschreibung 3": string;
  "Transaktions-Nr.": string;
  "Devisenkurs zum Originalbetrag in Abrechnungswährung": string;
  "Einzelbetrag": string;
  "Belastung": string;
  "Gutschrift": string;
  "Saldo": string;
}

interface DeutscheBankRow {
  "Buchungstag": string;
  "Wert": string;
  "Umsatzart": string;
  "Begünstigter / Auftraggeber": string;
  "Verwendungszweck": string;
  "IBAN": string;
  "BIC": string;
  "Kundenreferenz": string;
  "Mandatsreferenz ": string;
  "Gläubiger ID": string;
  "Fremde Gebühren": string;
  "Betrag": string;
  "Abweichender Empfänger": string;
  "Anzahl der Aufträge": string;
  "Anzahl der Schecks": string;
  "Soll": string;
  "Haben": string;
  "Währung": string;

}

interface IngRow {
  "Buchung": string;
  "Valuta": string;
  "Auftraggeber/Empfänger": string;
  "Buchungstext": string;
  "Verwendungszweck": string;
  "Saldo": string;
  "Währung": string;
  "Betrag": string;
}

interface N26Row {
  Datum: string;
  "Empfänger": string;
  "Kontonummer": string;
  "Transaktionstyp": string;
  "Verwendungszweck": string;
  "Kategorie": string;
  "Betrag (EUR)": string;
  "Betrag (Fremdwährung)": string;
  "Fremdwährung": string;
  "Wechselkurs": string;
}

interface WiseRow {
  "TransferWise ID": string;
  "Date": string;
  "Amount": string;
  "Currency": string;
  "Description": string;
  "Payment Reference": string;
  "Running Balance": string;
  "Exchange From": string;
  "Exchange To": string;
  "Exchange Rate": string;
  "Payer Name": string;
  "Payee Name": string;
  "Payee Account Number": string;
  "Merchant": string;
  "Card Last Four Digits": string;
  "Card Holder Full Name": string;
  "Attachment": string;
  "Note": string;
  "Total fees": string;
}

interface GenericEngRow {
  "Date": string;
  "Description": string;
  "Amount": string;
  "Who": string;
  "Who Identifier": string;
  "Booking Text": string;
}

interface VimPayRow {
  "Date": string;
  "Account holder": string;
  "IBAN of the account holder": string;
  "Reference": string;
  "Remitter / Recipient": string;
  "IBAN of the remitter / recipient": string;
  "Amount": string;
  "Currency": string;
}

interface PaypalEnglishRow {
  "Date": string;
  "Time": string;
  "Time Zone": string;
  "Description": string;
  "Currency": string;
  "Gross": string;
  "Fee": string;
  "Net": string;
  "Balance": string;
  "Transaction ID": string;
  "From Email Address": string;
  "Name": string;
  "Bank Name": string;
  "Bank Account": string;
  "Shipping and Handling Amount": string;
  "Sales Tax": string;
  "Invoice ID": string;
  "Reference Txn ID": string;
}

interface PaypalGermanRow {
  "Datum": string;
  "Uhrzeit": string;
  "Zeitzone": string;
  "Beschreibung": string;
  "Währung": string;
  "Brutto": string;
  "Entgelt": string;
  "Netto": string;
  "Guthaben": string;
  "Transaktionscode": string;
  "Absender E-Mail-Adresse": string;
  "Name": string;
  "Name der Bank": string;
  "Bankkonto": string;
  "Versand- und Bearbeitungsgebühr": string;
  "Umsatzsteuer": string;
  "Rechnungsnummer": string;
  "Zugehöriger Transaktionscode": string;
}

interface RevolutRow {
  "Type": string;
  "Product": string;
  "Started Date": string;
  "Completed Date": string;
  "Description": string;
  "Amount": string;
  "Fee": string;
  "Currency": string;
  "State": string;
  "Balance": string;
}


