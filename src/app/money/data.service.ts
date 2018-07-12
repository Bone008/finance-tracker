import { Injectable, EventEmitter } from "@angular/core";
import { BehaviorSubject } from "rxjs";
import { map } from "rxjs/operators";
import { ITransaction, DataContainer, Transaction, ImportedRow } from "../../proto/model";
import { compareTimestamps } from "../core/proto-util";

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private data = new DataContainer();
  private highestImportedRowId = 0;
  private readonly transactionsSubject = new BehaviorSubject<Transaction[]>([]);

  readonly transactions$ = this.transactionsSubject.asObservable();
  readonly transactionsSorted$ = this.transactions$
    // TODO: Also support group transactions.
    .pipe(map(arr => arr.slice().sort((a, b) => -compareTimestamps(a.single!.date, b.single!.date))));

  setDataContainer(data: DataContainer) {
    this.data = data;
    this.updateHighestImportedRowId();
    this.notifyTransactions();
  }

  getDataContainer(): DataContainer {
    return this.data;
  }

  getCurrentTransactionList(): Transaction[] {
    return this.data.transactions || [];
  }

  removeTransactions(toRemove: Transaction | Transaction[]) {
    const transactions = pluralizeArgument(toRemove);
    for (let transaction of transactions) {
      const index = this.data.transactions.indexOf(transaction);
      this.data.transactions.splice(index, 1);
    }
    this.notifyTransactions();
  }

  addTransactions(toAdd: Transaction | Transaction[]) {
    // Validate all importedRowIds.
    for (let transaction of pluralizeArgument(toAdd)) {
      if (transaction.dataType === "single") {
        this.validateImportedRowId(transaction.single!.importedRowId);
      } else {
        transaction.group!.children.forEach(child => this.validateImportedRowId(child.importedRowId));
      }
    }

    this.data.transactions = this.data.transactions.concat(toAdd);
    this.notifyTransactions();
  }

  addImportedRows(toAdd: ImportedRow | ImportedRow[]) {
    const rows = pluralizeArgument(toAdd);
    if (rows.some(row => row.id !== 0)) {
      throw new Error("rows with existing ids cannot be added to the database");
    }
    for (let row of rows) {
      row.id = ++this.highestImportedRowId;
      this.data.importedRows.push(row);
    }
  }

  getImportedRowById(id: number): ImportedRow | null {
    return this.data.importedRows.find(row => row.id === id) || null;
  }

  /** Returns all imported rows. DO NOT MODIFY THE RETURNED ARRAY. */
  getImportedRows(): ImportedRow[] {
    return this.data.importedRows;
  }

  private notifyTransactions() {
    this.transactionsSubject.next(this.data.transactions);
  }

  private updateHighestImportedRowId() {
    if (this.data.importedRows.length > 0) {
      this.highestImportedRowId =
        Math.max(...this.data.importedRows.map(row => row.id));
    } else {
      this.highestImportedRowId = 0;
    }
  }

  private validateImportedRowId(rowId: number) {
    if (rowId === 0) return;
    if (rowId < 0) {
      throw new Error("importedRowId may not be negative");
    }
    if (!this.data.importedRows.some(row => row.id === rowId)) {
      throw new Error(`linked importedRowId ${rowId} was not found in the database`);
    }
  }
}

function pluralizeArgument<T>(arg: T | T[]): T[] {
  if (arg instanceof Array) {
    return arg;
  } else {
    return [arg];
  }
}
