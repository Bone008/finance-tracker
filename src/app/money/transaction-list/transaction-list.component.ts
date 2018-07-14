import { SelectionModel } from '@angular/cdk/collections';
import { Component, OnInit, ViewChild } from '@angular/core';
import { MatPaginator, MatTableDataSource } from '@angular/material';
import { Subject } from 'rxjs';
import { debounceTime, map } from 'rxjs/operators';
import { GroupData, Transaction, TransactionData } from '../../../proto/model';
import { LoggerService } from '../../core/logger.service';
import { cloneMessage, compareTimestamps, moneyToNumber, numberToMoney, timestampNow, timestampToDate, timestampToWholeSeconds } from '../../core/proto-util';
import { DataService } from '../data.service';
import { DialogService } from '../dialog.service';
import { extractTransactionData, forEachTransactionData, isGroup, isSingle, mapTransactionData, mapTransactionDataField } from '../model-util';
import { MODE_ADD, MODE_EDIT } from '../transaction-edit/transaction-edit.component';

/** Time in ms to wait after input before applying the filter. */
const FILTER_DEBOUNCE_TIME = 500;

@Component({
  selector: 'app-transaction-list',
  templateUrl: './transaction-list.component.html',
  styleUrls: ['./transaction-list.component.css'],
})
export class TransactionListComponent implements OnInit {
  transactionsDataSource = new MatTableDataSource<Transaction>();
  selection = new SelectionModel<Transaction>(true);

  @ViewChild(MatPaginator)
  private paginator: MatPaginator;
  /** Current value of the filter textbox (not debounced). */
  private _filterInput = "";
  private readonly filterSubject = new Subject<string>();

  get filterInput() { return this._filterInput; }
  set filterInput(value: string) {
    this._filterInput = value;
    this.filterSubject.next(value);
  }

  constructor(
    private readonly dataService: DataService,
    private readonly loggerService: LoggerService,
    private readonly dialogService: DialogService) { }

  ngOnInit() {
    this.transactionsDataSource.paginator = this.paginator;
    this.transactionsDataSource.filterPredicate = (transaction, filter) => this.matchesFilter(transaction, filter);

    this.dataService.transactions$
      .pipe(map(transactions => transactions.slice().sort(
        (a, b) => this.compareTransactions(a, b))))
      .subscribe(value => this.transactionsDataSource.data = value);

    this.filterSubject
      .pipe(debounceTime(FILTER_DEBOUNCE_TIME))
      .subscribe(() => this.updateFilterNow());
  }

  ngOnDestroy() {
  }

  updateFilterNow() {
    if (this.transactionsDataSource.filter !== this.filterInput) {
      this.transactionsDataSource.filter = this.filterInput;

      // Deselect all transactions that are no longer visible.
      this.selection.deselect(...this.selection.selected.filter(
        t => this.transactionsDataSource.filteredData.indexOf(t) === -1)
      );
    }
  }

  clearFilter() {
    this.filterInput = "";
    this.updateFilterNow();
  }

  filterByLabel(label: string, additive: boolean) {
    let newFilter = this.filterInput;
    if (additive && newFilter.length > 0) {
      newFilter += " " + label;
    } else {
      newFilter = label;
    }

    this.filterInput = newFilter;
    this.updateFilterNow();
  }

  startImportCsv() {
    const dialogRef = this.dialogService.openFormImport();
    dialogRef.afterClosed().subscribe(result => {
      if (result === true) {
        const entries = dialogRef.componentInstance.entriesToImport;
        // Store rows, which generates their ids.
        this.dataService.addImportedRows(entries.map(e => e.row));
        // Link transactions to their rows and store them.
        for (let entry of entries) {
          console.assert(entry.transaction.single != null,
            "import should only generate single transactions");
          entry.transaction.single!.importedRowId = entry.row.id;
          this.dataService.addTransactions(entry.transaction);
        }

        this.loggerService.log(`Imported ${dialogRef.componentInstance.entriesToImport.length} transactions.`);
      }
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
      .afterClosed().subscribe((value: boolean) => {
        if (value) {
          this.dataService.addTransactions(transaction);
        }
      });
  }

  startEditTransaction(transaction: Transaction) {
    const tempTransaction = cloneMessage(Transaction, transaction);
    this.dialogService.openTransactionEdit(tempTransaction, MODE_EDIT)
      .afterClosed().subscribe(value => {
        if (value) {
          Object.assign(transaction, tempTransaction);
          console.log("Edited", transaction);
        }
      });
  }

  startSplitTransaction(transaction: Transaction) {
    if (!isSingle(transaction)) throw new Error('only single transactions supported');
    const data = transaction.single;

    const dialogRef = this.dialogService.openTransactionSplit(data);
    dialogRef.afterClosed().subscribe(value => {
      if (value) {
        const totalAmount = moneyToNumber(data.amount);
        const newAmount =
          Math.sign(totalAmount) * dialogRef.componentInstance.splitAmount;
        const remainingAmount = totalAmount - newAmount;

        const newTransaction = cloneMessage(Transaction, <Transaction>transaction);
        newTransaction.single!.amount = numberToMoney(newAmount);
        data.amount = numberToMoney(remainingAmount);

        this.dataService.addTransactions(newTransaction);

        this.selection.select(newTransaction);
        console.log("Split", data, `into ${newAmount} + ${remainingAmount}.`);
      }
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

  getTransactionDate(transaction: Transaction): Date {
    // TODO properly create aggregate date of groups.
    return timestampToDate(extractTransactionData(transaction)[0].date);
  }

  getTransactionAmount(transaction: Transaction): number {
    return mapTransactionData(transaction, data => moneyToNumber(data.amount))
      .reduce((a, b) => a + b, 0);
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

    // TODO: If equal, sort by dateCreated, once it exists.
    return -(timeA - timeB);
  }

  private matchesFilter(transaction: Transaction, filter: string): boolean {
    if (!filter) return true;

    const dataList = extractTransactionData(transaction);

    return filter.split(/\s+/).every(filterPart => {
      const inverted = filterPart.startsWith("-");
      if (inverted) filterPart = filterPart.substr(1);

      let filterRegex;
      try { filterRegex = new RegExp(filterPart, 'i'); }
      catch (e) { return true; } // Assume user is still typing, always pass.

      const match = dataList.some(data =>
        filterRegex.test(data.who)
        || filterRegex.test(data.whoIdentifier)
        || filterRegex.test(data.reason)
        || filterRegex.test(data.bookingText)
        || filterRegex.test(data.comment)
        || transaction.labels.some(label => filterRegex.test(label))
      );

      return match !== inverted;
    });
  }

}
