import { dateToTimestamp, numberToMoney } from "../../core/proto-util";
import { FormatMapping, MappingBuilder } from "./mapping-builder";

/** Dictionary that contains configurations for each supported import format. */
export const MAPPINGS_BY_FORMAT: { [format: string]: FormatMapping[] } = {
  'ksk_camt': new MappingBuilder<KskCamtRow>()
    .addMapping("date", "Valutadatum", parseDate)
    .addMapping("amount", "Betrag", parseAmount)
    .addMapping("reason", "Verwendungszweck", undefined)
    .addMapping("who", "Beguenstigter/Zahlungspflichtiger", undefined)
    .addMapping("whoIdentifier", "Kontonummer/IBAN", undefined)
    .addMapping("bookingText", "Buchungstext", undefined)
    .build(),
  'ksk_creditcard': new MappingBuilder<KskCreditcardRow>()
    .addMapping("date", "Belegdatum", parseDate)
    .addMapping("amount", "Buchungsbetrag", parseAmount)
    .addMapping("reason", "Transaktionsbeschreibung", undefined)
    .addMapping("who", "Transaktionsbeschreibung Zusatz", undefined)
    .addConstantMapping("bookingText", "KREDITKARTE")
    .build(),
};

const dateRegex = /^(\d\d)\.(\d\d)\.(\d\d)$/;
function parseDate(rawValue: string) {
  const match = dateRegex.exec(rawValue);
  if (match === null) throw new Error("could not parse date: " + rawValue);
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = 2000 + Number(match[3]);
  return dateToTimestamp(new Date(year, month - 1, day));
}

function parseAmount(rawValue: string) {
  // Assume German nubmer formatting.
  const num = Number(rawValue.replace(/\./g, "").replace(/,/g, "."));
  if (isNaN(num)) throw new Error("could not parse amount: " + rawValue);
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
