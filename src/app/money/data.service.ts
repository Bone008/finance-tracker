import { Injectable, EventEmitter } from "@angular/core";
import { DataContainer } from "./data-container.model";
import { Transaction } from "./transaction.model";
import { Observable, BehaviorSubject } from "rxjs";

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private data = new DataContainer();
  private readonly transactionsSubject = new BehaviorSubject<Transaction[]>([]);

  readonly transactions$ = this.transactionsSubject.asObservable();

  setDataContainer(data: DataContainer) {
    this.data = data;
    this.notifyTransactions();
  }

  getCurrentTransactionList(): Transaction[] {
    return this.data.transactions;
  }

  removeTransactions(toRemove: Transaction | Transaction[]) {
    const transactions = pluralizeArgument(toRemove);
    for (let transaction of transactions) {
      const index = this.data.transactions.indexOf(transaction);
      this.data.transactions.splice(index, 1);
    }
    this.notifyTransactions();
  }

  addTransactions(toAdd: Transaction | Transaction[]) {
    const transactions = pluralizeArgument(toAdd);
    this.data.transactions = this.data.transactions.concat(toAdd);
    this.notifyTransactions();
  }

  private notifyTransactions() {
    this.transactionsSubject.next(this.data.transactions);
  }
}

function pluralizeArgument<T>(arg: T | T[]): T[] {
  if (arg instanceof Array) {
    return arg;
  } else {
    return [arg];
  }
}