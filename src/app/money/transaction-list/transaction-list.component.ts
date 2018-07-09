import { Component, Input, OnInit, ViewChild, Output, EventEmitter } from '@angular/core';
import { MatPaginator, MatTableDataSource, MatDialog } from '@angular/material';
import { Transaction } from '../transaction.model';
import { TransactionDetailComponent } from '../transaction-detail/transaction-detail.component';
import { FormImportComponent } from '../form-import/form-import.component';
import { LoggerService } from '../../core/logger.service';
import { SelectionModel } from '@angular/cdk/collections';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

/** Time in ms to wait after input before applying the filter. */
const FILTER_DEBOUNCE_TIME = 500;

@Component({
  selector: 'app-transaction-list',
  templateUrl: './transaction-list.component.html',
  styleUrls: ['./transaction-list.component.css'],
})
export class TransactionListComponent implements OnInit {
  @Input() transactions: Transaction[];
  transactionsDataSource = new MatTableDataSource<Transaction>();
  selection = new SelectionModel<Transaction>(true);

  @ViewChild(MatPaginator)
  private paginator: MatPaginator;
  /** Current value of the filter textbox (not debounced). */
  private _filterInput = "";
  private readonly filterSubject = new Subject<string>();

  get filterInput() { return this._filterInput; }
  set filterInput(value: string) { this._filterInput = value; this.filterSubject.next(value); }

  constructor(
    private readonly loggerService: LoggerService,
    private readonly dialogService: MatDialog) { }

  ngOnInit() {
    this.transactionsDataSource.data = this.transactions;
    this.transactionsDataSource.paginator = this.paginator;
    this.transactionsDataSource.filterPredicate = (transaction, filter) => this.matchesFilter(transaction, filter);

    this.filterSubject
      .pipe(debounceTime(FILTER_DEBOUNCE_TIME))
      .subscribe(() => this.updateFilterNow());
  }

  updateFilterNow() {
    if (this.transactionsDataSource.filter !== this.filterInput) {
      this.transactionsDataSource.filter = this.filterInput;
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

  openImportCsvDialog() {
    const dialogRef = this.dialogService.open(FormImportComponent, {
      data: { "existingTransactions": this.transactions }
    });
    dialogRef.afterClosed().subscribe((result: boolean) => {
      if (result === true) {
        // TODO: Should actually modify transactions in DataContainer instead,
        // change when model access service is implemented.
        this.transactions = this.transactions.concat(dialogRef.componentInstance.transactionsToImport);
        this.transactionsDataSource.data = this.transactions;
        this.loggerService.log(`Imported ${dialogRef.componentInstance.transactionsToImport.length} transactions.`);
      }
    });
  }

  openAddTransactionDialog() {
    this.dialogService.open(TransactionDetailComponent).afterClosed().subscribe(value => {
      console.log(value);
    });
  }

  deleteSelectedTransactions() {
    // TODO: Move this to model access service.
    for (let transaction of this.selection.selected) {
      const index = this.transactions.indexOf(transaction);
      this.transactions.splice(index, 1);
    }
    this.selection.clear();
    this.transactionsDataSource.data = this.transactions;
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

  formatTransactionNotes(transaction: Transaction): string {
    const data = [transaction.who, transaction.reasonForTransfer, transaction.comment];
    return data.filter(value => !!value).join(", ");
  }

  /** Returns if the number of selected elements matches the total number of visible rows. */
  isAllSelected() {
    return this.selection.selected.length === this.transactionsDataSource.filteredData.length;
  }

  /** Selects all rows if they are not all selected; clears selection otherwise. */
  masterToggle() {
    this.isAllSelected() ?
      this.selection.clear() :
      this.transactionsDataSource.filteredData.forEach(row => this.selection.select(row));
  }

  private matchesFilter(transaction: Transaction, filter: string): boolean {
    if (!filter) return true;

    return filter.split(/\s+/).every(filterPart => {
      let filterRegex;
      try { filterRegex = new RegExp(filterPart, 'i'); }
      catch (e) { return true; } // Assume user is still typing, always pass.

      return filterRegex.test(transaction.who)
        || filterRegex.test(transaction.whoSecondary || '')
        || filterRegex.test(transaction.reasonForTransfer || '')
        || filterRegex.test(transaction.bookingText || '')
        || filterRegex.test(transaction.comment || '')
        || transaction.labels.some(label => filterRegex.test(label));
    });
  }

}
