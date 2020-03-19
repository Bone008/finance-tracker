import { SelectionModel } from '@angular/cdk/collections';
import { AfterViewInit, ChangeDetectorRef, Component, ViewChild } from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { ActivatedRoute, Router } from '@angular/router';
import * as moment from 'moment';
import { combineLatest, of, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { patchShortcuts } from 'src/app/core/keyboard-shortcuts-patch';
import { makeSharedObject, patchObject } from 'src/app/core/util';
import { google, GroupData, Transaction, TransactionData } from '../../../proto/model';
import { LoggerService } from '../../core/logger.service';
import { cloneMessage, compareTimestamps, moneyToNumber, numberToMoney, timestampNow, timestampToDate, timestampToMilliseconds, timestampToWholeSeconds } from '../../core/proto-util';
import { CurrencyService } from '../currency.service';
import { DataService } from '../data.service';
import { DialogService } from '../dialog.service';
import { FilterState } from '../filter-input/filter-state';
import { addLabelToTransaction, extractTransactionData, getTransactionAmount, getTransactionUniqueCurrency, isGroup, isSingle, mapTransactionData, mapTransactionDataField, MONEY_EPSILON, removeLabelFromTransaction } from '../model-util';
import { RuleService } from '../rule.service';
import { TransactionFilterService } from '../transaction-filter.service';
import { MODE_ADD, MODE_EDIT } from './transaction-edit/transaction-edit.component';

// Extension of Transaction class to hold objects used by the view.
interface TransactionViewCache {
  __date?: Date;
  __formattedNotes?: [string, string][];
  __transferInfo?: object;
}

@Component({
  selector: 'app-transactions',
  templateUrl: './transactions.component.html',
  styleUrls: ['./transactions.component.css'],
})
export class TransactionsComponent implements AfterViewInit {
  readonly shortcuts = patchShortcuts([
    // Selection
    { key: 'ctrl + a', command: () => this.isAllSelected() || this.masterToggle(), preventDefault: true },
    {
      key: 'ctrl + d', command: e => {
        if (this.selection.selected.length > 0) {
          e.event.preventDefault();
        }
        this.selection.clear();
      }
    },
    {
      key: 'l',
      command: () => {
        // Focus "add label" text field of first selected transaction.
        // Not the Angular way, but effective.
        const firstLabelInput = document.querySelector('.data-row.selected .add-inline-label input');
        if (firstLabelInput instanceof HTMLElement) {
          firstLabelInput.focus();
        }
      },
      preventDefault: true,
    },
    // CRUD actions.
    { key: ['c', 'n', 'plus'], command: () => this.startAddTransaction() },
    { key: 'e', command: () => this.selection.selected.length !== 1 || !this.selection.selected[0].single || this.startEditTransaction(this.selection.selected[0]) },
    { key: 's', command: () => this.selection.selected.length !== 1 || !this.selection.selected[0].single || this.startSplitTransaction(this.selection.selected[0]) },
    { key: 'd', command: () => this.selection.selected.length !== 1 || !this.selection.selected[0].single || this.startCopyTransaction(this.selection.selected[0]) },
    { key: 'g', command: () => !this.canGroup(this.selection.selected) && !this.canUngroup(this.selection.selected) || this.groupOrUngroupTransactions(this.selection.selected) },
    { key: 'del', command: () => this.selection.selected.length === 0 || this.deleteTransactions(this.selection.selected) },
  ]);

  readonly filterState = new FilterState();
  readonly transactionsDataSource = new MatTableDataSource<Transaction>();
  transactionsSubject = of<Transaction[]>([]);
  selection = new SelectionModel<Transaction>(true);

  @ViewChild(MatPaginator, { static: true })
  private paginator: MatPaginator;
  private txSubscription: Subscription;
  private forceShowTransactions = new Set<Transaction>();

  constructor(
    private readonly dataService: DataService,
    private readonly filterService: TransactionFilterService,
    private readonly ruleService: RuleService,
    private readonly currencyService: CurrencyService,
    private readonly loggerService: LoggerService,
    private readonly dialogService: DialogService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly changeDetector: ChangeDetectorRef) {
  }

  ngAfterViewInit() {
    this.transactionsDataSource.paginator = this.paginator;
    this.transactionsSubject = this.transactionsDataSource.connect();

    this.filterState.followFragment(this.route, this.router);

    // Reset to first page whenever filter changes.
    // We do NOT want this to happen when transaction list changes, otherwise
    // grouping transactions while on a different page is annoying.
    this.filterState.value$.subscribe(() => {
      this.transactionsDataSource.paginator!.firstPage();
      // No longer force any transactions to remain visible.
      this.forceShowTransactions.clear();
    });

    // Listen to updates of both the data source and the filter.
    this.txSubscription = combineLatest(this.dataService.transactions$, this.filterState.value$)
      .pipe(
        map(([transactions, filterValue]) => {
          const filterPredicate = this.filterService.makeFilterPredicate(filterValue);
          const results = transactions.filter(t => filterPredicate(t) || this.forceShowTransactions.has(t));
          results.sort((a, b) => this.compareTransactions(a, b));
          return results;
        })
      )
      .subscribe(value => {
        this.transactionsDataSource.data = value;

        // Deselect all transactions that are no longer part of the filtered data.
        this.selection.deselect(...this.selection.selected.filter(
          t => value.indexOf(t) === -1)
        );
      });

    this.changeDetector.detectChanges();
  }

  ngOnDestroy() {
    this.txSubscription.unsubscribe();
  }

  filterByLabel(label: string, additive: boolean) {
    // TODO Refactor token operations into some utility method.
    const addedToken = 'label=' + label;
    let newFilter = this.filterState.getCurrentValue();
    if (additive && newFilter.length > 0) {
      newFilter += " " + addedToken;
    } else {
      newFilter = addedToken;
    }

    this.filterState.setValueNow(newFilter);
  }

  /** Opens dialog to create a new transaction. */
  startAddTransaction() {
    // Adding is equivalent to copying from an empty transaction.
    this.startCopyTransaction(new Transaction({
      single: new TransactionData({
        date: timestampNow(),
        accountId: this.dataService.getUserSettings().defaultAccountIdOnAdd,
      }),
    }));
  }

  /** Opens dialog to create a new transaction with values taken from another one. */
  startCopyTransaction(template: Transaction) {
    const transaction = cloneMessage(Transaction, template);
    if (!isSingle(transaction)) throw new Error('only single transaction templates supported');
    // Reset date to now.
    transaction.single.date = timestampNow();
    // Reset modified flag.
    transaction.single.modified = null;

    this.dialogService.openTransactionEdit(transaction, MODE_ADD)
      .afterConfirmed().subscribe(() => {
        transaction.single!.created = timestampNow();
        this.forceShowTransactions.add(transaction);
        this.dataService.addTransactions(transaction);
        this.ruleService.notifyAdded(transaction);
      });
  }

  startEditTransaction(transaction: Transaction) {
    const tempTransaction = cloneMessage(Transaction, transaction);
    this.dialogService.openTransactionEdit(tempTransaction, MODE_EDIT)
      .afterConfirmed().subscribe(() => {
        Object.assign(transaction, tempTransaction);
        transaction.single!.modified = timestampNow();
        this.forceShowTransactions.add(transaction);
        this.dataService.addTransactions([]); // Trigger list refresh to reorder in case date was changed.
        this.ruleService.notifyModified([transaction]);
      });
  }

  startSplitTransaction(transaction: Transaction) {
    if (!isSingle(transaction)) throw new Error('only single transactions supported');
    const data = transaction.single;

    const dialogRef = this.dialogService.openTransactionSplit(data);
    dialogRef.afterConfirmed().subscribe(() => {
      const totalAmount = moneyToNumber(data.amount);
      const newAmount =
        Math.sign(totalAmount) * dialogRef.componentInstance.splitAmount;
      const remainingAmount = totalAmount - newAmount;

      const newTransaction = cloneMessage(Transaction, <Transaction>transaction);
      newTransaction.single!.amount = numberToMoney(newAmount);
      data.amount = numberToMoney(remainingAmount);

      const now = timestampNow();
      newTransaction.single!.modified = now;
      data.modified = now;

      this.forceShowTransactions.add(transaction);
      this.forceShowTransactions.add(newTransaction);
      this.dataService.addTransactions(newTransaction);
      this.ruleService.notifyModified([transaction, newTransaction]);

      this.selection.select(newTransaction);
      console.log("Split", data, `into ${newAmount} + ${remainingAmount}.`);
    });
  }

  async deleteTransactions(transactions: Transaction[]) {
    // Detect orphans.
    const affectedRowIds = mapTransactionDataField(transactions, 'importedRowId')
      .filter(rowId => rowId > 0);
    const orphanedRowIds = new Set<number>();
    for (let rowId of affectedRowIds) {
      const referrers = this.dataService.getTransactionsReferringToImportedRow(rowId);
      // If there is no referring transaction left that is not about to be deleted,
      // the row is about to be orphaned.
      if (!referrers.some(transaction => transactions.indexOf(transaction) === -1)) {
        orphanedRowIds.add(rowId);
      }
    }

    // Ask what should happen to orphans.
    let deleteOrphans = false;
    if (orphanedRowIds.size > 0) {
      const result = await this.dialogService.openConfirmDeleteWithOrphans(
        transactions.length, orphanedRowIds.size).afterClosed().toPromise();

      if (result === 'delete') {
        deleteOrphans = true;
      } else if (result === 'keep') {
        // Just keep them as is.
      } else {
        return; // Cancel.
      }
    }

    this.selection.clear();
    this.dataService.removeTransactions(transactions);

    if (deleteOrphans) {
      for (let rowId of Array.from(orphanedRowIds)) {
        this.dataService.removeImportedRow(rowId);
      }
    }
  }

  /**
   * Puts a set of transactions into a single group. The set may contain
   * both single and group transactions. The resulting group will have a union
   * of all labels of its children.
   */
  groupTransactions(transactions: Transaction[]) {
    let isCrossCurrencyTransfer = false;
    if (transactions.length === 2 && isSingle(transactions[0]) && isSingle(transactions[1])
      && getTransactionUniqueCurrency(transactions, this.dataService) === null
      && Math.sign(moneyToNumber(transactions[0].single!.amount)) !== Math.sign(moneyToNumber(transactions[1].single!.amount))
    ) {
      const summedAmount = getTransactionAmount(transactions[0], this.dataService, this.currencyService)
        + getTransactionAmount(transactions[1], this.dataService, this.currencyService);
      isCrossCurrencyTransfer = confirm('It seems like this group could be a transfer across multiple currencies.\n'
        + 'Do you want to treat this as a transfer?\n'
        + 'If yes (press OK), the total amount of the group will be treated as 0.\n'
        + 'If no (press Cancel), the total amount of the group will be '
        + this.currencyService.format(summedAmount, this.dataService.getMainCurrency(), true) + '.');
    }

    const newChildren = extractTransactionData(transactions);
    const newLabelsSet = new Set<string>();
    for (let transaction of transactions) {
      transaction.labels.forEach(newLabelsSet.add, newLabelsSet);
    }

    const newTransaction = new Transaction({
      labels: Array.from(newLabelsSet),
      group: new GroupData({
        children: newChildren,
      }),
    });
    if (isCrossCurrencyTransfer) {
      newTransaction.group!.isCrossCurrencyTransfer = true;
    }

    this.selection.clear();
    this.forceShowTransactions.add(newTransaction);
    this.dataService.removeTransactions(transactions);
    this.dataService.addTransactions(newTransaction);
    this.ruleService.notifyModified([newTransaction]);
    this.selection.select(newTransaction);
  }

  ungroupTransaction(transaction: Transaction) {
    if (!isGroup(transaction)) throw new Error('can only ungroup a group');

    const newTransactions = transaction.group.children.map(
      data => new Transaction({
        single: data,
        labels: transaction.labels.slice(),
        // TODO: Group comment is lost right now.
      }));

    this.selection.deselect(transaction);
    newTransactions.forEach(this.forceShowTransactions.add, this.forceShowTransactions);
    this.dataService.removeTransactions(transaction);
    this.dataService.addTransactions(newTransactions);
    this.ruleService.notifyModified(newTransactions);
    this.selection.select(...newTransactions);
  }

  /** Calls group or ungroup, depending on what makes sense. */
  groupOrUngroupTransactions(transactions: Transaction[]) {
    if (this.canGroup(transactions)) {
      this.groupTransactions(transactions);
    } else if (this.canUngroup(transactions)) {
      this.ungroupTransaction(transactions[0]);
    } else {
      throw new Error('invalid argument, can neither group nor ungroup');
    }
  }

  addLabelToTransaction(principal: Transaction, newLabel: string) {
    if (newLabel.length === 0) return;
    // If the principal is within the selection,
    // assume the user wants to multi-edit all selected ones.
    const affectedTransactions = this.selection.isSelected(principal)
      ? this.selection.selected
      : [principal];

    for (let transaction of affectedTransactions) {
      addLabelToTransaction(transaction, newLabel);
    }
    this.ruleService.notifyModified(affectedTransactions);
  }

  deleteLabelFromTransaction(principal: Transaction, label: string) {
    const affectedTransactions = this.selection.isSelected(principal)
      ? this.selection.selected
      : [principal];

    for (let transaction of affectedTransactions) {
      removeLabelFromTransaction(transaction, label);
    }
    this.ruleService.notifyModified(affectedTransactions);
  }

  /** Returns the label that was deleted, or null if prerequisites were not met. */
  deleteLastLabelFromTransaction(principal: Transaction): string | null {
    if (principal.labels.length === 0) return null;
    const label = principal.labels[principal.labels.length - 1];

    const affectedTransactions = this.selection.isSelected(principal)
      ? this.selection.selected
      : [principal];

    // Don't to anything if operating on the entire selection,
    // but not all other selected transactions share the same last label.
    if (!affectedTransactions.every(otherTransaction =>
      otherTransaction.labels.length > 0
      && otherTransaction.labels[otherTransaction.labels.length - 1] === label
    )) {
      return null;
    }

    for (let transaction of affectedTransactions) {
      transaction.labels.splice(-1, 1);
    }
    this.ruleService.notifyModified(affectedTransactions);
    return label;
  }

  navigateLabelEditUp(event: KeyboardEvent) {
    // Not the Angular way, but it is simple and it works ...
    const current = event.target as HTMLElement;
    const nextRow = current.closest('.data-row')!.previousElementSibling;
    if (nextRow) {
      nextRow.querySelector<HTMLInputElement>('.add-inline-label input')!.focus();
    }
  }

  navigateLabelEditDown(event: KeyboardEvent) {
    // Not the Angular way, but it is simple and it works ...
    const current = event.target as HTMLElement;
    const nextRow = current.closest('.data-row')!.nextElementSibling;
    if (nextRow) {
      nextRow.querySelector<HTMLInputElement>('.add-inline-label input')!.focus();
    }
  }

  /** Returns if the number of selected elements matches the total number of visible rows. */
  isAllSelected() {
    return this.selection.selected.length
      === this.transactionsDataSource.filteredData.length;
  }

  /** Selects all rows if they are not all selected; clears selection otherwise. */
  masterToggle() {
    if (this.isAllSelected()) {
      this.selection.clear();
    } else {
      for (let row of this.transactionsDataSource.filteredData) {
        this.selection.select(row);
      }
    }
  }

  isTransactionGroup = isGroup;

  /**
   * Decides the currency in which the summed part of the transaction should be displayed and
   * formats it accordingly.
   */
  formatTransactionAmount(transaction: Transaction): string {
    let displayedCurrency = getTransactionUniqueCurrency(transaction, this.dataService);
    if (displayedCurrency === null) {
      displayedCurrency = this.dataService.getMainCurrency();
    }
    const amount = getTransactionAmount(transaction, this.dataService, this.currencyService, displayedCurrency);
    return this.currencyService.format(amount, displayedCurrency);
  }

  /**
   * If the transaction is not recorded in the main currency, this calculates and formats the amount
   * converted to the main currency.
   */
  formatTransactionAmountAlt(transaction: Transaction): string | null {
    let displayedCurrency = getTransactionUniqueCurrency(transaction, this.dataService);
    if (displayedCurrency === null) {
      return 'group of different currencies';
    }
    if (displayedCurrency === this.dataService.getMainCurrency()) {
      return null;
    }
    const amount = getTransactionAmount(transaction, this.dataService, this.currencyService);
    return this.currencyService.format(amount, this.dataService.getMainCurrency());
  }

  isTransactionAmountNegative(transaction: Transaction): boolean {
    return getTransactionAmount(transaction, this.dataService, this.currencyService) < -MONEY_EPSILON;
  }

  getTransactionDate(transaction: Transaction & TransactionViewCache): Date {
    // TODO properly create aggregate date of groups.
    const millis = timestampToMilliseconds(extractTransactionData(transaction)[0].date);

    // Fix object identity to play nice with Angular change tracking.
    if (!transaction.__date || transaction.__date.getTime() !== millis)
      transaction.__date = new Date(millis);
    return transaction.__date;
  }

  getTransactionIcon(transaction: Transaction): string {
    let uniqueIcon: string | null = null;
    for (const data of extractTransactionData(transaction)) {
      const account = this.dataService.getAccountById(data.accountId);
      const icon = account && account.icon;
      if (uniqueIcon === null) {
        uniqueIcon = icon;
      } else if (uniqueIcon !== icon) {
        uniqueIcon = null;
        break;
      }
    }
    return uniqueIcon || 'list';
  }

  getTransferInfo(transaction: Transaction & TransactionViewCache): object | null {
    // (Need to copy due to a bug in TypeScript intersection types.)
    const tx = transaction;

    // Only allow groups with exactly 2 children ...
    if (!isGroup(transaction) || transaction.group.children.length !== 2
      // ... with different accounts
      || transaction.group.children[0].accountId === transaction.group.children[1].accountId
      // ... with a total amount of 0.
      || Math.abs(getTransactionAmount(transaction, this.dataService, this.currencyService)) >= MONEY_EPSILON) {
      return null;
    }

    const amounts = transaction.group.children.map(child => moneyToNumber(child.amount));
    if (Math.sign(amounts[0]) === Math.sign(amounts[1])) {
      // No opposing signs.
      return null;
    }
    const accounts = mapTransactionData(transaction, this.dataService.accountFromTxDataFn);
    const fromIndex = amounts[0] < 0 ? 0 : 1;

    // Since the summed amount is ~0, we can assume that fromAmount and toAmount have the same
    // monetary value. If currencies are the same, they should also be the same number.

    const ret = {
      fromAccount: accounts[fromIndex],
      toAccount: accounts[1 - fromIndex],
      isMultiCurrency: accounts[0].currency !== accounts[1].currency,
      fromAmountFormatted: this.currencyService.format(-amounts[fromIndex], accounts[fromIndex].currency),
      toAmountFormatted: this.currencyService.format(amounts[1 - fromIndex], accounts[1 - fromIndex].currency),
    }

    // Fix object identity to play nice with Angular change tracking.
    // NOTE: DO NOT USE patchObject BECAUSE WE DO NOT WANT DEEP UPDATES OF ACCOUNT OBJECTS!
    if (!tx.__transferInfo) tx.__transferInfo = {};
    return Object.assign(tx.__transferInfo, ret);
  }

  /** Returns array of lines. */
  formatTransactionNotes(transaction: Transaction & TransactionViewCache): [string, string][] {
    const ret = extractTransactionData(transaction)
      .sort((a, b) => -compareTimestamps(a.date, b.date))
      .map<[string, string]>(data => [
        (isGroup(transaction)
          ? `(${this.getSignString(moneyToNumber(data.amount))}) `
          : '') + [data.who, data.reason].filter(value => !!value).join(", "),
        data.comment
      ]);

    // Fix object identity to play nice with Angular change tracking.
    if (!transaction.__formattedNotes) transaction.__formattedNotes = [];
    patchObject(transaction.__formattedNotes, ret);
    return transaction.__formattedNotes;
  }

  private getSignString(num: number): string {
    if (num > 0) return '+';
    if (num < 0) return '\u2013'; // ndash
    return '0';
  }

  canGroup(selected: Transaction[]): boolean {
    return selected.length >= 2;
  }

  canUngroup(selected: Transaction[]): boolean {
    return selected.length === 1 && isGroup(selected[0]);
  }

  getGroupTooltip(selected: Transaction[]): string {
    if (this.canGroup(selected)) return "Group";
    if (this.canUngroup(selected)) return "Ungroup";
    return "Group/ungroup";
  }

  getSelectionSummary = makeSharedObject<object>(() => {
    if (this.selection.selected.length < 2) {
      return null;
    }

    const selected = this.selection.selected;

    let minTimestamp = new google.protobuf.Timestamp({ seconds: Infinity });
    let maxTimestamp = new google.protobuf.Timestamp({ seconds: -Infinity });
    for (const timestamp of mapTransactionDataField(selected, 'date')) {
      if (!timestamp) continue;
      if (compareTimestamps(timestamp, minTimestamp) < 0)
        minTimestamp = timestamp;
      if (compareTimestamps(timestamp, maxTimestamp) > 0)
        maxTimestamp = timestamp;
    }

    const minMoment = moment(timestampToDate(minTimestamp));
    const maxMoment = moment(timestampToDate(maxTimestamp));
    const datesAreSame = minMoment.format('ll') === maxMoment.format('ll');
    const diffDays = maxMoment.diff(minMoment, 'days') + 1;
    const diffMonths = maxMoment.diff(minMoment, 'months');

    const targetCurrency = getTransactionUniqueCurrency(selected, this.dataService)
      || this.dataService.getMainCurrency();

    let sum = 0;
    let sumPositive = 0;
    let sumNegative = 0;
    for (const transaction of selected) {
      const amount = getTransactionAmount(transaction, this.dataService, this.currencyService, targetCurrency);
      sum += amount;
      if (amount < 0) sumNegative += amount;
      else sumPositive += amount;
    }

    return {
      dateFirst: minMoment.toDate(), dateLast: maxMoment.toDate(), datesAreSame,
      diffDays, diffMonths,
      sumFormatted: this.currencyService.format(sum, targetCurrency),
      sumPositiveFormatted: this.currencyService.format(sumPositive, targetCurrency, true),
      sumNegativeFormatted: this.currencyService.format(sumNegative, targetCurrency, true),
      sumIsNegative: sum < -MONEY_EPSILON,
      hasPositiveAndNegative: sumPositive && sumNegative,
    };
  });

  /** Comparator for transactions so they are sorted by date in descending order. */
  private compareTransactions(a: Transaction, b: Transaction) {
    // NOTE: Could be optimized by calculating max in a manual loop
    // and thus avoiding array allocations.
    const timeA = isSingle(a)
      ? timestampToWholeSeconds(a.single.date)
      : Math.max(...a.group!.children.map(
        child => timestampToWholeSeconds(child.date)));
    const timeB = isSingle(b)
      ? timestampToWholeSeconds(b.single.date)
      : Math.max(...b.group!.children.map(
        child => timestampToWholeSeconds(child.date)));

    if (timeA !== timeB) {
      return -(timeA - timeB);
    }

    // Compare by date created if the other date is equal.
    const createdA = isSingle(a)
      ? timestampToMilliseconds(a.single.created)
      : Math.max(...a.group!.children.map(
        child => timestampToMilliseconds(child.created)));
    const createdB = isSingle(b)
      ? timestampToMilliseconds(b.single.created)
      : Math.max(...b.group!.children.map(
        child => timestampToMilliseconds(child.created)));

    return -(createdA - createdB);
  }

}
