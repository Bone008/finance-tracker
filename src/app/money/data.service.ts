import { Injectable } from "@angular/core";
import { BehaviorSubject, of } from "rxjs";
import { debounceTime } from "rxjs/operators";
import { Account, DataContainer, GlobalComment, ImportedRow, LabelConfig, ProcessingRule, Transaction, TransactionData, UserSettings } from "../../proto/model";
import { pluralizeArgument } from "../core/util";
import { extractAllLabels, extractTransactionData, forEachTransactionData, isSingle } from "./model-util";

// TODO: Split this up into multiple services responsible for individual entities.
@Injectable({
  providedIn: 'root'
})
export class DataService {
  private data = new DataContainer();
  private highestImportedRowId = 0;
  private readonly transactionsSubject = new BehaviorSubject<Transaction[]>([]);
  private readonly processingRulesSubject = new BehaviorSubject<ProcessingRule[]>([]);
  private readonly globalCommentsSubject = new BehaviorSubject<GlobalComment[]>([]);
  private readonly userSettingsSubject = new BehaviorSubject<UserSettings>(new UserSettings());

  // TODO implement accounts access
  readonly accounts$ = of([
    new Account({ id: 1, name: "Cash", icon: "money", currency: "EUR" }),
    new Account({ id: 2, name: "Bank account", icon: "assignment", currency: "EUR" }),
  ]);

  readonly transactions$ = this.transactionsSubject.asObservable().pipe(debounceTime(0));
  readonly processingRules$ = this.processingRulesSubject.asObservable();
  readonly globalComments$ = this.globalCommentsSubject.asObservable();
  readonly userSettings$ = this.userSettingsSubject.asObservable();

  setDataContainer(data: DataContainer) {
    this.data = data;
    this.updateHighestImportedRowId();
    this.notifyTransactions();
    this.notifyProcessingRules();
    this.notifyGlobalComments();
    this.notifyUserSettings();
  }

  getDataContainer(): DataContainer {
    return this.data;
  }

  getUserSettings(): UserSettings {
    if (!this.data.userSettings) {
      this.data.userSettings = new UserSettings();
    }
    return this.data.userSettings;
  }

  getProcessingRules(): ProcessingRule[] {
    return this.data.processingRules;
  }

  getCurrentTransactionList(): Transaction[] {
    return this.data.transactions || [];
  }

  removeTransactions(toRemove: Transaction | Transaction[]) {
    const transactions = pluralizeArgument(toRemove);
    for (const transaction of transactions) {
      const index = this.data.transactions.indexOf(transaction);
      if (index >= 0) {
        this.data.transactions.splice(index, 1);
      }
    }
    this.notifyTransactions();
  }

  addTransactions(toAdd: Transaction | Transaction[]) {
    // Validate all importedRowIds.
    forEachTransactionData(toAdd,
      data => this.validateImportedRowId(data.importedRowId));

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

  removeImportedRow(rowId: number) {
    if (this.getTransactionDataReferringToImportedRow(rowId).length > 0) {
      throw new Error(`cannot delete row ${rowId} because it has a transaction referring to it`);
    }

    const index = this.data.importedRows.findIndex(row => row.id === rowId);
    if (index === -1) {
      throw new Error(`cannot delete row ${rowId} because it was not found`);
    }
    this.data.importedRows.splice(index, 1);
    if (this.highestImportedRowId === rowId) {
      this.updateHighestImportedRowId();
    }
  }

  getAllLabels(): string[] {
    return extractAllLabels(this.data.transactions);
  }

  getLabelConfig(label: string): LabelConfig | null {
    if (this.data.labelConfigs.hasOwnProperty(label)) {
      return this.data.labelConfigs[label];
    }
    return null;
  }

  getOrCreateLabelConfig(label: string): LabelConfig {
    if (!this.data.labelConfigs.hasOwnProperty(label)) {
      this.data.labelConfigs[label] = new LabelConfig();
    }
    return this.data.labelConfigs[label];
  }

  getImportedRowById(id: number): ImportedRow | null {
    return this.data.importedRows.find(row => row.id === id) || null;
  }

  /** Returns all imported rows. DO NOT MODIFY THE RETURNED ARRAY. */
  getImportedRows(): ImportedRow[] {
    return this.data.importedRows;
  }

  getTransactionsReferringToImportedRow(importedRowId: number): Transaction[] {
    return this.data.transactions.filter(transaction => {
      if (isSingle(transaction)) {
        return transaction.single.importedRowId === importedRowId;
      } else {
        return transaction.group!.children.some(child => child.importedRowId === importedRowId);
      }
    });
  }

  getTransactionDataReferringToImportedRow(importedRowId: number): TransactionData[] {
    return extractTransactionData(this.data.transactions).filter(data => data.importedRowId === importedRowId);
  }

  addProcessingRules(toAdd: ProcessingRule | ProcessingRule[]) {
    const rules = pluralizeArgument(toAdd);
    this.data.processingRules.push(...rules);
    this.notifyProcessingRules();
  }

  removeProcessingRules(toRemove: ProcessingRule | ProcessingRule[]) {
    for (const rule of pluralizeArgument(toRemove)) {
      const index = this.data.processingRules.indexOf(rule);
      if (index >= 0) {
        this.data.processingRules.splice(index, 1);
      }
    }
    this.notifyProcessingRules();
  }

  addGlobalComment(comment: GlobalComment) {
    this.data.globalComments.push(comment);
    this.notifyGlobalComments();
  }

  removeGlobalComment(comment: GlobalComment) {
    const index = this.data.globalComments.indexOf(comment);
    if (index === -1) {
      throw new Error(`cannot delete comment because it was not found`);
    }
    this.data.globalComments.splice(index, 1);
    this.notifyGlobalComments();
  }

  private notifyTransactions() {
    this.transactionsSubject.next(this.data.transactions);
  }

  private notifyProcessingRules() {
    this.processingRulesSubject.next(this.data.processingRules);
  }

  private notifyGlobalComments() {
    this.globalCommentsSubject.next(this.data.globalComments);
  }

  private notifyUserSettings() {
    this.userSettingsSubject.next(this.data.userSettings || new UserSettings());
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
