import { Component, Input, OnInit, ViewChild, Output, EventEmitter } from '@angular/core';
import { MatPaginator, MatTableDataSource, MatDialog } from '@angular/material';
import { Transaction } from '../transaction.model';
import { TransactionDetailComponent } from '../transaction-detail/transaction-detail.component';
import { FormImportComponent } from '../form-import/form-import.component';

@Component({
  selector: 'app-transaction-list',
  templateUrl: './transaction-list.component.html',
  styleUrls: ['./transaction-list.component.css'],
})
export class TransactionListComponent implements OnInit {
  @Input() transactions: Transaction[];
  transactionsDataSource = new MatTableDataSource<Transaction>();

  @ViewChild(MatPaginator)
  private paginator: MatPaginator;

  constructor(private readonly dialogService: MatDialog) { }

  ngOnInit() {
    this.transactionsDataSource.data = this.transactions;
    this.transactionsDataSource.paginator = this.paginator;
    this.transactionsDataSource.filterPredicate = (transaction, filter) => this.matchesFilter(transaction, filter);
  }

  filterByLabel(label: string, additive: boolean) {
    let filter = this.transactionsDataSource.filter;
    if (additive && filter.length > 0) {
      filter += " " + label;
    } else {
      filter = label;
    }
    this.transactionsDataSource.filter = filter;
  }

  openImportCsvDialog() {
    this.dialogService.open(FormImportComponent).afterClosed().subscribe(value => {
      console.log(value);
    });
  }

  openAddTransactionDialog() {
    this.dialogService.open(TransactionDetailComponent).afterClosed().subscribe(value => {
      console.log(value);
    });
  }

  private matchesFilter(transaction: Transaction, filter: string): boolean {
    if (!filter) return true;

      return filter.split(/\s+/).every(filterPart => {
        let filterRegex;
        try { filterRegex = new RegExp(filterPart, 'i'); }
        catch(e) { return true; } // Assume user is still typing, always pass.

        return filterRegex.test(transaction.who)
          || filterRegex.test(transaction.comment || '')
          || transaction.labels.some(label => filterRegex.test(label));
      });
  }

}
