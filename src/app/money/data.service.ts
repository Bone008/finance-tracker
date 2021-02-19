import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";
import { debounceTime } from "rxjs/operators";
import { Account, BillingInfo, DataContainer, GlobalComment, ImportedRow, LabelConfig, ProcessingRule, Transaction, TransactionData, TransactionPreset, UserSettings } from "../../proto/model";
import { pluralizeArgument, removeByValue } from "../core/util";
import { MigrationsService } from "./migrations.service";
import { extractAllLabels, extractAllLabelsSet, extractTransactionData, forEachTransactionData, getLabelParentOf, isSingle, isValidBilling } from "./model-util";

const DEFAULT_MAIN_CURRENCY = 'EUR';
const DEFAULT_ACCOUNT = new Account({
  id: 0,
  icon: 'error',
  name: 'Unknown',
  currency: 'EUR',
});

// TODO: Split this up into multiple services responsible for individual entities.
@Injectable({
  providedIn: 'root'
})
export class DataService {
  private data = new DataContainer();
  private highestImportedRowId = 0;
  private readonly accountsSubject = new BehaviorSubject<Account[]>([]);
  private readonly transactionsSubject = new BehaviorSubject<Transaction[]>([]);
  private readonly transactionPresetsSubject = new BehaviorSubject<TransactionPreset[]>([]);
  private readonly processingRulesSubject = new BehaviorSubject<ProcessingRule[]>([]);
  private readonly globalCommentsSubject = new BehaviorSubject<GlobalComment[]>([]);
  private readonly userSettingsSubject = new BehaviorSubject<UserSettings>(new UserSettings());

  readonly accounts$ = this.accountsSubject.asObservable();
  readonly transactions$ = this.transactionsSubject.asObservable().pipe(debounceTime(0));
  readonly transactionPresets$ = this.transactionPresetsSubject.asObservable();
  readonly processingRules$ = this.processingRulesSubject.asObservable();
  readonly globalComments$ = this.globalCommentsSubject.asObservable();
  readonly userSettings$ = this.userSettingsSubject.asObservable();

  private accountsById: Account[] = [];

  constructor(private readonly migrationsService: MigrationsService) {
    // Maintain account id cache.
    this.accounts$.subscribe(accounts => {
      this.accountsById = [];
      for (const account of accounts) {
        this.accountsById[account.id] = account;
      }
    });
  }

  setDataContainer(data: DataContainer) {
    this.migrationsService.preprocessDataContainer(data);
    this.data = data;
    this.updateHighestImportedRowId();
    this.notifyAccounts();
    this.notifyTransactions();
    this.notifyTransactionPresets();
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

  /** Returns the main currency of the database, defaulting to EUR if unset. */
  getMainCurrency(): string {
    return this.getUserSettings().mainCurrency || DEFAULT_MAIN_CURRENCY;
  }

  getCurrentProcessingRules(): ProcessingRule[] {
    return this.data.processingRules;
  }

  getCurrentTransactionList(): Transaction[] {
    return this.data.transactions;
  }

  getCurrentAccountList(): Account[] {
    return this.data.accounts;
  }

  readonly accountFromTxDataFn = (data: TransactionData) => this.getAccountById(data.accountId);
  readonly accountFromIdFn = (accountId: number) => this.getAccountById(accountId);
  readonly currencyFromTxDataFn = (data: TransactionData) => this.getAccountById(data.accountId).currency;
  readonly currencyFromAccountIdFn = (accountId: number) => this.getAccountById(accountId).currency;

  /** Returns the account with the given id, or a static default account with id 0 if not found. */
  getAccountById(accountId: number): Account {
    return this.accountsById[accountId] || DEFAULT_ACCOUNT;
  }

  addAccounts(toAdd: Account | Account[]) {
    // Find highest id in data.
    let highestAccountId = (this.data.accounts.length > 0
      ? Math.max(...this.data.accounts.map(a => a.id))
      : 0);

    const accounts = pluralizeArgument(toAdd);
    for (const account of accounts) {
      if (account.id !== 0) {
        throw new Error('Can only add accounts with unassigned ids!');
      }
      account.id = ++highestAccountId;
    }
    this.data.accounts.push(...accounts);
    this.notifyAccounts();
  }

  removeAccounts(toRemove: Account | Account[]) {
    for (const account of pluralizeArgument(toRemove)) {
      // Reset default-on-add account if it is being deleted.
      if (this.getUserSettings().defaultAccountIdOnAdd === account.id) {
        this.getUserSettings().defaultAccountIdOnAdd = 0;
      }
      removeByValue(this.data.accounts, account);
    }
    this.notifyAccounts();
  }

  removeTransactions(toRemove: Transaction | Transaction[]) {
    for (const transaction of pluralizeArgument(toRemove)) {
      removeByValue(this.data.transactions, transaction);
    }
    this.notifyTransactions();
  }

  addTransactions(toAdd: Transaction | Transaction[]) {
    // Validate all importedRowIds.
    forEachTransactionData(toAdd,
      data => this.validateImportedRowId(data.importedRowId));

    this.data.transactions.push(...pluralizeArgument(toAdd));
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

  getAllLabelsSet(): Set<string> {
    return extractAllLabelsSet(this.data.transactions);
  }

  getLabelConfig(label: string): LabelConfig | null {
    if (this.data.labelConfigs.hasOwnProperty(label)) {
      return this.data.labelConfigs[label];
    }
    return null;
  }

  setLabelConfig(label: string, config: LabelConfig) {
    this.data.labelConfigs[label] = config;
  }

  deleteLabelConfig(label: string) {
    if (this.data.labelConfigs.hasOwnProperty(label)) {
      delete this.data.labelConfigs[label];
    }
  }

  /** Returns a label's configured billing info (inherited by its parents), or a default billing if unset. */
  getLabelBilling(label: string): BillingInfo {
    let current: string | null = label;
    let labelConfig: LabelConfig | null;
    do {
      labelConfig = this.getLabelConfig(current);
      current = getLabelParentOf(current!);
    }
    while (current && (!labelConfig || !isValidBilling(labelConfig.billing)));
    return (labelConfig && labelConfig.billing) || new BillingInfo();
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

  addTransactionPresets(toAdd: TransactionPreset | TransactionPreset[]) {
    this.data.transactionPresets.push(...pluralizeArgument(toAdd));
    this.notifyTransactionPresets();
  }

  removeTransactionPresets(toRemove: TransactionPreset | TransactionPreset[]) {
    for (const entity of pluralizeArgument(toRemove)) {
      removeByValue(this.data.transactionPresets, entity);
    }
    this.notifyTransactionPresets();
  }

  addProcessingRules(toAdd: ProcessingRule | ProcessingRule[]) {
    const rules = pluralizeArgument(toAdd);
    this.data.processingRules.push(...rules);
    this.notifyProcessingRules();
  }

  removeProcessingRules(toRemove: ProcessingRule | ProcessingRule[]) {
    for (const rule of pluralizeArgument(toRemove)) {
      removeByValue(this.data.processingRules, rule);
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

  private notifyAccounts() {
    this.accountsSubject.next(this.data.accounts);
  }

  private notifyTransactions() {
    this.transactionsSubject.next(this.data.transactions);
  }

  private notifyTransactionPresets() {
    this.transactionPresetsSubject.next(this.data.transactionPresets);
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
