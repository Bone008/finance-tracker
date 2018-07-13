import { Component, OnInit, Inject } from '@angular/core';
import { LoggerService } from '../../core/logger.service';
import { PapaParseService, PapaParseResult } from 'ngx-papaparse';
import { MAT_DIALOG_DATA } from '@angular/material';
import { Transaction, TransactionData, ITransactionData, ImportedRow } from '../../../proto/model';
import { dateToTimestamp, numberToMoney, timestampToDate, timestampToWholeSeconds } from '../../core/proto-util';
import { DataService } from '../data.service';

@Component({
  selector: 'app-form-import',
  templateUrl: './form-import.component.html',
  styleUrls: ['./form-import.component.css']
})
export class FormImportComponent implements OnInit {
  fileFormat: 'ksk_camt' = 'ksk_camt';
  
  /**
   * Contains parsed transactions and raw row data to preview.
   * They are not yet linked to each other, because the rows will only get
   * their id once they are actually imported.
   */
  entriesToImport: { transaction: Transaction, row: ImportedRow }[] = [];

  /** Amount of existing rows that were found during parsing. */
  duplicateCount = 0;

  /** List of errors that happened during parsing. */
  errors: string[] = [];

  constructor(
    private readonly dataService: DataService,
    private readonly loggerService: LoggerService,
    private readonly papaService: PapaParseService) {
  }

  ngOnInit() {
  }

  getPreviewMinDate(): Date | null {
    if (this.entriesToImport.length > 0) {
      return new Date(1000 * Math.min(...this.entriesToImport.map(
        e => timestampToWholeSeconds(e.transaction.single!.date)
      )));
    } else {
      return null;
    }
  }

  getPreviewMaxDate(): Date | null {
    if (this.entriesToImport.length > 0) {
      return new Date(1000 * Math.max(...this.entriesToImport.map(
        e => timestampToWholeSeconds(e.transaction.single!.date)
      )));
    } else {
      return null;
    }
  }

  setFile(file: File) {
    console.log(file);
    this.papaService.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: result => this.processFileContents(file.name, result),
    });
  }

  private processFileContents(fileName: string, csvData: PapaParseResult) {
    console.log(csvData);
    this.entriesToImport = [];
    this.errors = [];

    if (!this.validateRequiredColumns(csvData.meta.fields)) {
      return;
    }

    const existingRows = this.dataService.getImportedRows();

    // Process rows.
    for (let i = 0; i < csvData.data.length; i++) {
      const row = csvData.data[i] as KskCamtRow;

      if(this.isDuplicate(row, existingRows)) {
        this.duplicateCount++;
        continue;
      }

      // Create imported row without an id, which will be assigned
      // once (if) it is entered into the database.
      const importedRow = new ImportedRow({
        sourceFileName: fileName,
        fileFormat: this.fileFormat,
      });
      for (let field of csvData.meta.fields) {
        importedRow.values[field] = row[field];
      }

      const transactionProperties: ITransactionData = {};
      transactionProperties.isCash = false;

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

        transactionProperties[mapping.transactionKey] = value;
      }
      if (hasErrors) {
        continue;
      }

      this.entriesToImport.push({
        row: importedRow,
        transaction: new Transaction({
          single: new TransactionData(transactionProperties),
        }),
      });
    }

    console.log(this.entriesToImport);
  }

  private validateRequiredColumns(presentColumns: string[]): boolean {
    const missingColumns = KSK_CAMT_MAPPINGS
      .map(mapping => mapping.column)
      .filter(column => presentColumns.indexOf(column) === -1);
    if (missingColumns.length > 0) {
      this.reportError("Import failed: Required columns are missing from data: " + missingColumns.join(", "));
      return false;
    }
    return true;
  }

  private isDuplicate(row: KskCamtRow, existingRows: ImportedRow[]): boolean {
    return existingRows.some(existing => {
      // Check if the set of all mapped columns is identical to
      // the new row. This is supposed to provide some robustness
      // against small file format changes by only checking the fields
      // that are relevant to the app instead of all of them.
      for(let mapping of KSK_CAMT_MAPPINGS) {
        if(row[mapping.column] !== existing.values[mapping.column]) {
          return false;
        }
      }
      return true;
    });
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
    return dateToTimestamp(new Date(year, month - 1, day));
  }),
  createMapping("amount", "Betrag", rawValue => {
    // Assume German nubmer formatting.
    const num = Number(rawValue.replace(/\./g, "").replace(/,/g, "."));
    if (isNaN(num)) throw new Error("could not parse amount: " + rawValue);
    return numberToMoney(num);
  }),
  createMapping("reason", "Verwendungszweck", undefined),
  createMapping("who", "Beguenstigter/Zahlungspflichtiger", undefined),
  createMapping("whoIdentifier", "Kontonummer/IBAN", undefined),
  createMapping("bookingText", "Buchungstext", undefined),
];

interface KskCamtMapping {
  transactionKey: keyof ITransactionData;
  column: keyof KskCamtRow;
  converterCallback?: (rawValue: string) => any;
}

function createMapping<K extends keyof ITransactionData>(
    /**/ transactionKey: K,
    /**/ column: keyof KskCamtRow,
    /**/ converterCallback?: (rawValue: string) => ITransactionData[K]): KskCamtMapping {
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
