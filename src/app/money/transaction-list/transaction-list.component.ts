import { SelectionModel } from '@angular/cdk/collections';
import { AfterViewInit, ChangeDetectorRef, Component, ViewChild } from '@angular/core';
import { MatPaginator, MatTableDataSource } from '@angular/material';
import * as moment from 'moment';
import { combineLatest, merge, of, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, startWith, tap } from 'rxjs/operators';
import { google, GroupData, Transaction, TransactionData } from '../../../proto/model';
import { LoggerService } from '../../core/logger.service';
import { cloneMessage, compareTimestamps, moneyToNumber, numberToMoney, timestampNow, timestampToDate, timestampToMilliseconds, timestampToWholeSeconds } from '../../core/proto-util';
import { DataService } from '../data.service';
import { DialogService } from '../dialog.service';
import { extractTransactionData, forEachTransactionData, getTransactionAmount, isGroup, isSingle, mapTransactionDataField } from '../model-util';
import { MODE_ADD, MODE_EDIT } from '../transaction-edit/transaction-edit.component';
import { TransactionFilterService } from '../transaction-filter.service';

/** Time in ms to wait after input before applying the filter. */
const FILTER_DEBOUNCE_TIME = 500;

@Component({
  selector: 'app-transaction-list',
  templateUrl: './transaction-list.component.html',
  styleUrls: ['./transaction-list.component.css'],
})
export class TransactionListComponent implements AfterViewInit {
  readonly transactionsDataSource = new MatTableDataSource<Transaction>();
  transactionsSubject = of<Transaction[]>([]);
  selection = new SelectionModel<Transaction>(true);

  @ViewChild(MatPaginator)
  private paginator: MatPaginator;
  /** Current value of the filter textbox (not debounced). */
  private _filterInput = "";
  /** Emits events whenever the filter input value changes. */
  private readonly filterInputSubject = new Subject<string>();
  /** Emits events when the filter should be updated immediately. */
  private readonly filterImmediateSubject = new Subject<string>();

  get filterInput() { return this._filterInput; }
  set filterInput(value: string) {
    this._filterInput = value;
    this.filterInputSubject.next(value);
  }

  constructor(
    private readonly dataService: DataService,
    private readonly filterService: TransactionFilterService,
    private readonly loggerService: LoggerService,
    private readonly dialogService: DialogService,
    private readonly changeDetector: ChangeDetectorRef) {
  }

  ngAfterViewInit() {
    this.transactionsDataSource.paginator = this.paginator;
    this.transactionsSubject = this.transactionsDataSource.connect();

    const debouncedFilter$ = this.filterInputSubject.pipe(
      debounceTime(FILTER_DEBOUNCE_TIME));
    const mergedFilter$ = merge(debouncedFilter$, this.filterImmediateSubject).pipe(
      // Make it initially emit an event, so combineLatest starts working.
      startWith(""),
      distinctUntilChanged(),
      // Reset to first page whenever filter is changed.
      tap(() => this.transactionsDataSource.paginator!.firstPage())
    );

    // Listen to updates of both the data source and the filter.
    combineLatest(this.dataService.transactions$, mergedFilter$)
      .pipe(
        map(([transactions]) =>
          this.filterService.applyFilter(transactions, this.filterInput)),
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
  }

  clearFilter() {
    this.filterInput = "";
    this.filterImmediateSubject.next("");
  }

  filterByLabel(label: string, additive: boolean) {
    let newFilter = this.filterInput;
    if (additive && newFilter.length > 0) {
      newFilter += " " + label;
    } else {
      newFilter = label;
    }

    this.filterInput = newFilter;
    this.filterImmediateSubject.next(newFilter);
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

      this.loggerService.log(`Imported ${dialogRef.componentInstance.entriesToImport.length} transactions.`);
    });
  }

  startAddTransaction() {
    const transaction = new Transaction({
      single: new TransactionData({
        date: timestampNow(),
        isCash: true,
      }),
    });

    this.dialogService.openTransactionEdit(transaction, MODE_ADD)
      .afterConfirmed().subscribe(() => {
        transaction.single!.created = timestampNow();
        this.dataService.addTransactions(transaction);
      });
  }

  startEditTransaction(transaction: Transaction) {
    const tempTransaction = cloneMessage(Transaction, transaction);
    this.dialogService.openTransactionEdit(tempTransaction, MODE_EDIT)
      .afterConfirmed().subscribe(() => {
        Object.assign(transaction, tempTransaction);
        transaction.single!.modified = timestampNow();
        console.log("Edited", transaction);
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
    const newChildren = extractTransactionData(transactions);
    const newLabelsSet = new Set<string>();
    for (let transaction of transactions) {
      transaction.labels.forEach(newLabelsSet.add, newLabelsSet);
    }

    const newTransaction = new Transaction({
      labels: Array.from(newLabelsSet),
      isInternal: transactions.every(t => t.isInternal),
      group: new GroupData({
        children: newChildren,
      }),
    });

    this.selection.clear();
    this.dataService.removeTransactions(transactions);
    this.dataService.addTransactions(newTransaction);
    this.selection.select(newTransaction);
  }

  ungroupTransaction(transaction: Transaction) {
    if (!isGroup(transaction)) throw new Error('can only ungroup a group');

    const newTransactions = transaction.group.children.map(
      data => new Transaction({
        single: data,
        labels: transaction.labels.slice(),
        isInternal: transaction.isInternal,
        // TODO: Group comment is lost right now.
      }));

    this.selection.deselect(transaction);
    this.dataService.removeTransactions(transaction);
    this.dataService.addTransactions(newTransactions);
    this.selection.select(...newTransactions);
  }

  /** Calls groupSelection or ungroupSelection, depending on what makes sense. */
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
      if (transaction.labels.indexOf(newLabel) === -1) {
        transaction.labels.push(newLabel);
      }
    }
  }

  deleteLabelFromTransaction(principal: Transaction, label: string) {
    const affectedTransactions = this.selection.isSelected(principal)
      ? this.selection.selected
      : [principal];

    for (let transaction of affectedTransactions) {
      const index = transaction.labels.indexOf(label);
      if (index !== -1) {
        transaction.labels.splice(index, 1);
      }
    }
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
    return label;
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

  isTransactionCash(transaction: Transaction): boolean | null {
    let anyFalse = false;
    let anyTrue = false;
    forEachTransactionData(transaction, data => {
      if (data.isCash) anyTrue = true;
      else anyFalse = true;
    });

    // Both or none present --> indeterminate.
    if (anyFalse === anyTrue) return null;
    // Either all true or all false.
    return anyTrue;
  }

  /** Returns array of lines. */
  formatTransactionNotes(transaction: Transaction): [string, string][] {
    return extractTransactionData(transaction)
      .sort((a, b) => -compareTimestamps(a.date, b.date))
      .map<[string, string]>(data => [
        [data.who, data.reason].filter(value => !!value).join(", "),
        data.comment
      ]);
  }

  canGroup(selected: Transaction[]): boolean {
    return selected.length >= 2;
  }

  canUngroup(selected: Transaction[]): boolean {
    return selected.length === 1 && isGroup(selected[0]);
  }

  getGroupTooltip(selected: Transaction[]): string {
    if (this.canGroup(selected)) return "Group selection";
    if (this.canUngroup(selected)) return "Ungroup selection";
    return "Group/ungroup selection";
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
