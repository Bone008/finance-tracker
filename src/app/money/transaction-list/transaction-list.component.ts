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
  }

}
