import { escapeRegex } from "src/app/core/util";
import { dateToTimestamp, numberToMoney } from "../../../core/proto-util";
import { FormatMapping, FormatMappingBuilder } from "./format-mapping";

/** Dictionary that contains configurations for each supported import format. */
export const MAPPINGS_BY_FORMAT: { [format: string]: FormatMapping } = {
  'ksk_camt': new FormatMappingBuilder<KskCamtRow>()
    .addConstantMapping("isCash", false)
    .addMapping("date", "Valutadatum", parseDate)
    .addMapping("amount", "Betrag", parseAmount)
    .addMapping("reason", "Verwendungszweck")
    .addMapping("who", "Beguenstigter/Zahlungspflichtiger")
    .addMapping("whoIdentifier", "Kontonummer/IBAN")
    .addMapping("bookingText", "Buchungstext")
    .build(),
  'ksk_creditcard': new FormatMappingBuilder<KskCreditcardRow>()
    .addConstantMapping("isCash", false)
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
    .addConstantMapping("isCash", false)
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
    .addConstantMapping("isCash", false)
    .addMapping("date", "Wertstellung", parseDate)
    .addMapping("reason", "Verwendungszweck")
    .addMapping("who", "Auftraggeber / Begünstigter")
    .addMapping("whoIdentifier", "Kontonummer")
    .addMapping("amount", "Betrag (EUR)", parseAmount)
    .addMapping("bookingText", "Buchungstext")
    .build(),
  'ubs': new FormatMappingBuilder<UbsRow>()
    .addConstantMapping("isCash", false)
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
};

const dateRegex = /^(\d\d)\.(\d\d)\.(\d\d(?:\d\d)?)$/;
function parseDate(rawValue: string) {
  const match = dateRegex.exec(rawValue);
  if (match === null) throw new Error("could not parse date: " + rawValue);
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 1000) {
    year += 2000;
  }
  return dateToTimestamp(new Date(year, month - 1, day));
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
