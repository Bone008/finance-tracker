import { SelectionModel } from '@angular/cdk/collections';
import { AfterViewInit, ChangeDetectorRef, Component, ViewChild } from '@angular/core';
import { MatPaginator, MatTableDataSource } from '@angular/material';
import { ActivatedRoute } from '@angular/router';
import * as moment from 'moment';
import { combineLatest, of, Subscription } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { google, GroupData, Transaction, TransactionData } from '../../../proto/model';
import { LoggerService } from '../../core/logger.service';
import { cloneMessage, compareTimestamps, moneyToNumber, numberToMoney, timestampNow, timestampToDate, timestampToMilliseconds, timestampToWholeSeconds } from '../../core/proto-util';
import { CurrencyService } from '../currency.service';
import { DataService } from '../data.service';
import { DialogService } from '../dialog.service';
import { FilterState } from '../filter-input/filter-state';
import { addLabelToTransaction, extractTransactionData, getTransactionAmount, isGroup, isSingle, mapTransactionData, mapTransactionDataField, removeLabelFromTransaction } from '../model-util';
import { RuleService } from '../rule.service';
import { TransactionFilterService } from '../transaction-filter.service';
import { MODE_ADD, MODE_EDIT } from './transaction-edit/transaction-edit.component';

@Component({
  selector: 'app-transactions',
  templateUrl: './transactions.component.html',
  styleUrls: ['./transactions.component.css'],
})
export class TransactionsComponent implements AfterViewInit {
  private static lastFilterValue = "";

  readonly filterState = new FilterState(TransactionsComponent.lastFilterValue);
  readonly transactionsDataSource = new MatTableDataSource<Transaction>();
  transactionsSubject = of<Transaction[]>([]);
  selection = new SelectionModel<Transaction>(true);

  @ViewChild(MatPaginator)
  private paginator: MatPaginator;
  private txSubscription: Subscription;

  constructor(
    private readonly dataService: DataService,
    private readonly filterService: TransactionFilterService,
    private readonly ruleService: RuleService,
    private readonly currencyService: CurrencyService,
    private readonly loggerService: LoggerService,
    private readonly dialogService: DialogService,
    private readonly route: ActivatedRoute,
    private readonly changeDetector: ChangeDetectorRef) {
  }

  ngAfterViewInit() {
    this.transactionsDataSource.paginator = this.paginator;
    this.transactionsSubject = this.transactionsDataSource.connect();

    // TODO Add full support for query param by also updating it when the filter changes.
    this.route.queryParamMap.subscribe(queryParams => {
      const queryFilter = queryParams.get('q');
      if (queryFilter) {
        this.filterState.setValueNow(queryFilter);
      }
    });

    const filterValue$ = this.filterState.value$.pipe(
      // Remember last received value.
      tap(value => TransactionsComponent.lastFilterValue = value),
      // Reset to first page whenever filter is changed.
      tap(() => this.transactionsDataSource.paginator!.firstPage())
    );

    // Listen to updates of both the data source and the filter.
    this.txSubscription = combineLatest(this.dataService.transactions$, filterValue$)
      .pipe(
        map(([transactions, filterValue]) =>
          this.filterService.applyFilter(transactions, filterValue)),
        map(transactions => transactions.sort(
          (a, b) => this.compareTransactions(a, b)))
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

  startImportCsv() {
    const dialogRef = this.dialogService.openFormImport();
    dialogRef.afterConfirmed().subscribe(() => {
      this.selection.clear();

      const entries = dialogRef.componentInstance.entriesToImport;
      // Store rows, which generates their ids.
      this.dataService.addImportedRows(entries.map(e => e.row));
      // Link transactions to their rows and store them.
      for (let entry of entries) {
        console.assert(entry.transaction.single != null,
          "import should only generate single transactions");
        entry.transaction.single!.importedRowId = entry.row.id;
        this.dataService.addTransactions(entry.transaction);

        this.selection.select(entry.transaction);
      }
      this.ruleService.notifyImported(entries.map(e => e.transaction));

      this.loggerService.log(`Imported ${dialogRef.componentInstance.entriesToImport.length} transactions.`);
    });
  }

  /** Opens dialog to create a new transaction. */
  startAddTransaction() {
    // Adding is equivalent to copying from an empty transaction.
    this.startCopyTransaction(new Transaction({
      single: new TransactionData({
        date: timestampNow(),
        isCash: true,
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
    // TODO Remove this temporary check for grouping mixed currency transactions.
    const currencies =
      new Set<string>(mapTransactionData(transactions, this.dataService.currencyFromTxDataFn));
    if (currencies.size > 1) {
      alert('Cannot group transactions with mixed currencies yet!\nComing soon ...');
      return;
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

    this.selection.clear();
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
  getTransactionAmount = getTransactionAmount;

  getTransactionDate(transaction: Transaction): Date {
    // TODO properly create aggregate date of groups.
    return timestampToDate(extractTransactionData(transaction)[0].date);
  }

  getTransactionCurrencySymbol(transaction: Transaction): string {
    let uniqueCurrency: string | null = null;
    const currencies = mapTransactionData(transaction, this.dataService.currencyFromTxDataFn);
    for (const currency of currencies) {
      if (uniqueCurrency === null) {
        uniqueCurrency = currency;
      } else if (uniqueCurrency !== currency) {
        uniqueCurrency = null;
        break;
      }
    }
    if (uniqueCurrency === null) {
      return '??';
    }
    return this.currencyService.getSymbol(uniqueCurrency);
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

  getTransferInfo(transaction: Transaction): object | null {
    if (!isGroup(transaction) || transaction.group.children.length !== 2
      || transaction.group.children[0].accountId === transaction.group.children[1].accountId) {
      return null;
    }

    const amounts = transaction.group.children.map(child => moneyToNumber(child.amount));
    if (Math.sign(amounts[0]) === Math.sign(amounts[1])) {
      // No opposing signs.
      return null;
    }
    const currencies = transaction.group.children.map(this.dataService.currencyFromTxDataFn);
    if (currencies[0] !== currencies[1]) {
      // TODO: Cross-currency not supported yet.
      return null;
    }

    const fromIndex = amounts[0] < 0 ? 0 : 1;
    const from = transaction.group.children[fromIndex];
    const to = transaction.group.children[1 - fromIndex];

    return {
      fromAccount: this.dataService.getAccountById(from.accountId),
      toAccount: this.dataService.getAccountById(to.accountId),
      amount: Math.min(-amounts[fromIndex], amounts[1 - fromIndex]),
    }
  }

  /** Returns array of lines. */
  formatTransactionNotes(transaction: Transaction): [string, string][] {
    return extractTransactionData(transaction)
      .sort((a, b) => -compareTimestamps(a.date, b.date))
      .map<[string, string]>(data => [
        (isGroup(transaction)
          ? `(${this.getSignString(moneyToNumber(data.amount))}) `
          : '') + [data.who, data.reason].filter(value => !!value).join(", "),
        data.comment
      ]);
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
    if (this.canGroup(selected)) return "Group selected";
    if (this.canUngroup(selected)) return "Ungroup selected";
    return "Group/ungroup selected";
  }

  getSelectionSummary(): object | null {
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

    let sum = 0;
    let sumPositive = 0;
    let sumNegative = 0;
    for (const transaction of selected) {
      const amount = getTransactionAmount(transaction);
      sum += amount;
      if (amount < 0) sumNegative += amount;
      else sumPositive += amount;
    }
    //summary.push(`sum ${sum.toFixed(2)}, ${sumPositive.toFixed(2)}, ${sumNegative.toFixed(2)}`);

    return {
      dateFirst: minMoment.toDate(), dateLast: maxMoment.toDate(), datesAreSame,
      diffDays, diffMonths,
      sum, sumPositive, sumNegative,
    };
  }

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
