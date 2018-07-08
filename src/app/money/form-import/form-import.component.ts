import { Component, OnInit, Inject } from '@angular/core';
import { LoggerService } from '../../core/logger.service';
import { PapaParseService, PapaParseResult } from 'ngx-papaparse';
import { Transaction, createEmptyTransaction } from '../transaction.model';
import { MAT_DIALOG_DATA } from '@angular/material';

@Component({
  selector: 'app-form-import',
  templateUrl: './form-import.component.html',
  styleUrls: ['./form-import.component.css']
})
export class FormImportComponent implements OnInit {
  fileFormat: 'ksk_camt' = 'ksk_camt';
  transactionsToImport: Transaction[] = [];
  errors: string[] = [];

  private existingTransactions: Transaction[];

  constructor(
    @Inject(MAT_DIALOG_DATA) data: Transaction[],
    private readonly loggerService: LoggerService,
    private readonly papaService: PapaParseService) {
      this.existingTransactions = data['existingTransactions'];
    }

  ngOnInit() {
  }

  getPreviewMinDate(): Date | null {
    if (this.transactionsToImport.length > 0) {
      return new Date(
        Math.min.apply(null, this.transactionsToImport.map(t => t.date.getTime()))
      );
    } else {
      return null;
    }
  }
  getPreviewMaxDate(): Date | null {
    if (this.transactionsToImport.length > 0) {
      return new Date(
        Math.max.apply(null, this.transactionsToImport.map(t => t.date.getTime()))
      );
    } else {
      return null;
    }
  }

  setFile(file: File) {
    console.log(file);
    this.papaService.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: result => this.processFileContents(result),
    });
  }

  private processFileContents(csvData: PapaParseResult) {
    console.log(csvData);
    this.transactionsToImport = [];
    this.errors = [];

    // Validate file format.
    const missingColumns = KSK_CAMT_MAPPINGS
      .map(mapping => mapping.column)
      .filter(column => csvData.meta.fields.indexOf(column) === -1);
    if (missingColumns.length > 0) {
      this.reportError("Import failed: Required columns are missing from data: " + missingColumns.join(", "));
      return;
    }

    // Process rows.
    // TODO: Store as ImportedRow too and link Transactions to them.
    // TODO: Deduplicate with existingTransactions.
    for (let i = 0; i < csvData.data.length; i++) {
      const row = csvData.data[i] as KskCamtRow;

      const transaction = createEmptyTransaction();
      transaction.isCash = false;

      let hasErrors = false;
      for (let mapping of KSK_CAMT_MAPPINGS) {
        const rawValue = row[mapping.column];
        let value: any;
        if (mapping.converterCallback) {
          try { value = mapping.converterCallback(rawValue); }
          catch (e) {
            this.reportError(`Import error in row ${i}: ${e}`);
            hasErrors = true;
          }
        } else {
          value = rawValue;
        }

        transaction[mapping.transactionKey] = value;
      }
      if (hasErrors) {
        continue;
      }

      this.transactionsToImport.push(transaction);
    }

    console.log(this.transactionsToImport);
  }

  private reportError(error: string) {
    this.errors.push(error);
    this.loggerService.error(error);
  }

}

const dateRegex = /^(\d\d)\.(\d\d)\.(\d\d)$/;
const KSK_CAMT_MAPPINGS: KskCamtMapping[] = [
  createMapping("date", "Valutadatum", rawValue => {
    const match = dateRegex.exec(rawValue);
    if (match === null) throw new Error("could not parse date: " + rawValue);
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = 2000 + Number(match[3]);
    return new Date(year, month - 1, day);
  }),
  createMapping("amount", "Betrag", rawValue => {
    // Assume German nubmer formatting.
    const num = Number(rawValue.replace(/\./g, "").replace(/,/g, "."));
    if (isNaN(num)) throw new Error("could not parse amount: " + rawValue);
    return num;
  }),
  createMapping("reasonForTransfer", "Verwendungszweck", undefined),
  createMapping("who", "Beguenstigter/Zahlungspflichtiger", undefined),
  createMapping("whoSecondary", "Kontonummer/IBAN", undefined),
  createMapping("bookingText", "Buchungstext", undefined),
];

interface KskCamtMapping {
  transactionKey: keyof Transaction;
  column: keyof KskCamtRow;
  converterCallback?: (rawValue: string) => any;
}

function createMapping<K extends keyof Transaction>(
    /**/ transactionKey: K,
    /**/ column: keyof KskCamtRow,
    /**/ converterCallback?: (rawValue: string) => Transaction[K]): KskCamtMapping {
  return { transactionKey, column, converterCallback };
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
