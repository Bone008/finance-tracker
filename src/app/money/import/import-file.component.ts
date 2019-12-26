import { Component, EventEmitter, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Papa, ParseResult } from 'ngx-papaparse';
import { Observable } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { Account, ImportedRow, ITransactionData, Transaction, TransactionData } from '../../../proto/model';
import { LoggerService } from '../../core/logger.service';
import { timestampNow, timestampToWholeSeconds } from '../../core/proto-util';
import { DataService } from '../data.service';
import { RuleService } from '../rule.service';
import { FormatMapping } from './format-mapping';
import { ALL_FILE_FORMATS, ImportFileFormat, MAPPINGS_BY_FORMAT } from './mappings';

export const ALL_FILE_ENCODINGS = ['windows-1252', 'utf-8'];
export type ImportFileEncoding = 'windows-1252' | 'utf-8';

export interface ImportDialogData {
  account: Account | null;
  file?: File;
  forcedEncoding?: ImportFileEncoding;
}

@Component({
  selector: 'app-import-file',
  templateUrl: './import-file.component.html',
  styleUrls: ['./import-file.component.css']
})
export class ImportFileComponent implements OnInit {
  readonly allAccounts$: Observable<Account[]>;

  forcedFileName: string | null = null;
  isEncodingForced = false;

  // Form data.
  private _file: File | null = null;
  private _fileFormat: ImportFileFormat = 'ksk_camt';
  private _fileEncoding: ImportFileEncoding = 'windows-1252';
  private _account: Account | null = null;
  private readonly formInputChange = new EventEmitter<void>();

  get file() { return this._file; }
  set file(value: File | null) { this._file = value; this.formInputChange.emit(); }
  get fileFormat() { return this._fileFormat; }
  set fileFormat(value: ImportFileFormat) { this._fileFormat = value; this.formInputChange.emit(); }
  get fileEncoding() { return this._fileEncoding; }
  set fileEncoding(value: ImportFileEncoding) { this._fileEncoding = value; this.formInputChange.emit(); }
  get targetAccount() { return this._account; }
  set targetAccount(value: Account | null) { this._account = value; this.formInputChange.emit(); }

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
    @Inject(MAT_DIALOG_DATA) data: ImportDialogData,
    private readonly dataService: DataService,
    private readonly ruleService: RuleService,
    private readonly loggerService: LoggerService,
    private readonly papaService: Papa,
    private readonly matDialogRef: MatDialogRef<ImportFileComponent>,
  ) {
    this.allAccounts$ = this.dataService.accounts$;
    this.targetAccount = data.account || null;
    if (data.file) {
      this.file = data.file;
      this.forcedFileName = data.file.name;
    }

    if (data.forcedEncoding) {
      this.fileEncoding = data.forcedEncoding;
      this.isEncodingForced = true;
    }
    // Select account default file format & encoding if present.
    else if (this.targetAccount && ALL_FILE_ENCODINGS.includes(this.targetAccount.preferredFileEncoding)) {
      this.fileEncoding = <ImportFileEncoding>this.targetAccount.preferredFileEncoding;
    }
    if (this.targetAccount && ALL_FILE_FORMATS.includes(this.targetAccount.preferredFileFormat)) {
      this.fileFormat = <ImportFileFormat>this.targetAccount.preferredFileFormat;
    }
  }

  ngOnInit() {
    this.updateFilePreview();
    this.formInputChange
      .pipe(debounceTime(10))
      .subscribe(() => this.updateFilePreview());
  }

  onSubmit() {
    if (!this.targetAccount) {
      return;
    }

    const entries = this.entriesToImport;
    // Store rows, which generates their ids.
    this.dataService.addImportedRows(entries.map(e => e.row));
    // Link transactions to their rows and store them.
    for (const entry of entries) {
      console.assert(entry.transaction.single != null,
        "import should only generate single transactions");
      entry.transaction.single!.importedRowId = entry.row.id;
      this.dataService.addTransactions(entry.transaction);
    }
    this.ruleService.notifyImported(entries.map(e => e.transaction));
    this.loggerService.log(`Imported ${entries.length} transactions.`);

    // Update account default file format & encoding.
    this.targetAccount.preferredFileFormat = this.fileFormat;
    if (!this.isEncodingForced) {
      this.targetAccount.preferredFileEncoding = this.fileEncoding;
    }

    this.matDialogRef.close(true);
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

  private resetPreview() {
    this.entriesToImport = [];
    this.duplicateCount = 0;
    this.errors = [];
  }

  private updateFilePreview() {
    this.resetPreview();
    if (!this.file) {
      return;
    }

    const mapping = MAPPINGS_BY_FORMAT[this.fileFormat];
    if (!mapping) {
      this.reportError("Invalid file format.");
      return;
    }

    const file = this.file;
    this.papaService.parse(file, {
      beforeFirstChunk: firstChunk => {
        if (!mapping.startPattern) return firstChunk;
        const match = mapping.startPattern.exec(firstChunk);
        if (!match) {
          this.reportError("Warning: Could not detect file header, this may be the wrong file format! "
            + "Expected header: " + String(mapping.startPattern));
          return firstChunk;
        }

        return firstChunk.substr(match.index);
      },
      header: true,
      skipEmptyLines: true,
      encoding: this.fileEncoding,
      complete: result => this.processFileContents(file.name, mapping, result),
    });
  }

  private processFileContents(fileName: string, mapping: FormatMapping, csvData: ParseResult) {
    this.loggerService.debug('csvData', csvData);

    if (!this.validateRequiredColumns(csvData.meta.fields, mapping)) {
      return;
    }

    if (!this.targetAccount) {
      this.reportError("Please select an account!");
      return;
    }

    const existingRows = this.dataService.getImportedRows();

    // Process rows.
    for (let i = 0; i < csvData.data.length; i++) {
      const row = csvData.data[i] as { [column: string]: string };

      if (mapping.rowFilter && !mapping.rowFilter(row)) {
        continue;
      }

      if (this.isDuplicate(row, existingRows, mapping)) {
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
      transactionProperties.created = timestampNow();
      transactionProperties.accountId = this.targetAccount ? this.targetAccount.id : 0;

      let hasErrors = false;
      for (let [key, mapperCallback] of Object.entries(mapping.mappings)) {
        let value: any;
        try { value = mapperCallback!(row); }
        catch (e) {
          this.reportError(`Import error in row ${i}: ${e}`);
          hasErrors = true;
          continue;
        }

        transactionProperties[key] = value;
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

    this.loggerService.debug('entriesToImport', this.entriesToImport);
  }

  private validateRequiredColumns(presentColumns: string[], mapping: FormatMapping): boolean {
    const missingColumns = mapping.requiredColumns
      .filter(column => presentColumns.indexOf(column) === -1);
    if (missingColumns.length > 0) {
      this.reportError("Import failed: Required columns are missing from data: " + missingColumns.join(", "));
      return false;
    }
    return true;
  }

  private isDuplicate(row: { [column: string]: string }, existingRows: ImportedRow[], mapping: FormatMapping): boolean {
    return existingRows.some(existing => {
      // Check if the set of all mapped columns is identical to
      // the new row. This is supposed to provide some robustness
      // against small file format changes by only checking the fields
      // that are relevant to the app instead of all of them.
      for (let column of mapping.requiredColumns) {
        if (row[column] !== existing.values[column]) {
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
