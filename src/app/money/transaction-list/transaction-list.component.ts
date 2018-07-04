import { Component, OnInit, ViewChild } from '@angular/core';
import { Transaction, createTransaction, createDummyTransactions } from '../transaction.model';
import { MatTableDataSource, MatPaginator } from '@angular/material';

@Component({
  selector: 'app-transaction-list',
  templateUrl: './transaction-list.component.html',
  styleUrls: ['./transaction-list.component.css']
})
export class TransactionListComponent implements OnInit {
  transactions: Transaction[] = [];
  transactionsDataSource = new MatTableDataSource<Transaction>();

  @ViewChild(MatPaginator)
  paginator: MatPaginator;

  constructor() { }

  ngOnInit() {
    this.transactions = createDummyTransactions(25);
    this.transactionsDataSource.data = this.transactions;
    this.transactionsDataSource.paginator = this.paginator;
    this.transactionsDataSource.filterPredicate = (transaction, filter) => this.matchesFilter(transaction, filter);
  }

  private matchesFilter(transaction: Transaction, filter: string): boolean {
    if (!filter) return true;

    const filterRegex = new RegExp(filter, 'i');
    return filterRegex.test(transaction.who)
      || filterRegex.test(transaction.comment || '')
      || transaction.labels.find(label => filterRegex.test(label)) !== undefined;
  }

}
