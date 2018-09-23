import { Component, OnDestroy, OnInit } from '@angular/core';
import * as moment from 'moment';
import { Subscription } from 'rxjs';
import { Transaction } from '../../../proto/model';
import { timestampToMoment, timestampToWholeSeconds } from '../../core/proto-util';
import { maxBy } from '../../core/util';
import { DataService } from '../data.service';
import { getTransactionAmount, isSingle } from '../model-util';

@Component({
  selector: 'app-analytics',
  templateUrl: './analytics.component.html',
  styleUrls: ['./analytics.component.css']
})
export class AnalyticsComponent implements OnInit, OnDestroy {
  buckets: BucketInfo[] = [];

  private txSubscriptions: Subscription;

  constructor(private readonly dataService: DataService) { }

  ngOnInit() {
    this.txSubscriptions =
      this.dataService.transactions$.subscribe(() => this.analyzeTransactions());
  }

  ngOnDestroy() {
    this.txSubscriptions.unsubscribe();
  }

  analyzeTransactions() {
    const transactions = this.dataService.getCurrentTransactionList()
      .filter(t => !t.labels.includes('internal'));

    const transactionBuckets: { [key: string]: BilledTransaction[] } = {};
    const keyFormat = 'YYYY-MM';

    const now = moment();

    const numMonths = 24;
    for (let i = 0; i < numMonths; i++) {
      const month = now.clone().subtract(i, 'months').format(keyFormat);
      transactionBuckets[month] = [];
    }

    for (const transaction of transactions) {
      const dateMoment = timestampToMoment(isSingle(transaction)
        ? transaction.single.date
        : maxBy(transaction.group!.children, child => timestampToWholeSeconds(child.date))!.date
      );

      const key = dateMoment.format(keyFormat);
      if (key in transactionBuckets) {
        transactionBuckets[key].push({
          source: transaction,
          relevantLabels: transaction.labels,
          amount: getTransactionAmount(transaction),
        });
      }
    }

    this.buckets = [];
    for (const key of Object.keys(transactionBuckets)) {
      const positive = transactionBuckets[key].filter(t => t.amount > 0);
      const negative = transactionBuckets[key].filter(t => t.amount < 0);

      const labelBuckets = {};
      for (const tx of transactionBuckets[key]) {
        const lbl = tx.relevantLabels.join(',') || '<none>';
        if (typeof labelBuckets[lbl] === 'number') {
          labelBuckets[lbl] += tx.amount;
        } else {
          labelBuckets[lbl] = tx.amount;
        }
      }

      const topLabels = Object.keys(labelBuckets)
        .map(lbl => <[string, number]>[lbl, labelBuckets[lbl]])
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, 3);

      this.buckets.push({
        name: key,
        numTransactions: transactionBuckets[key].length,
        totalPositive: positive.map(t => t.amount).reduce((a, b) => a + b, 0),
        totalNegative: negative.map(t => t.amount).reduce((a, b) => a + b, 0),
        topLabels,
      });
    }
  }

}

interface BilledTransaction {
  source: Transaction;
  relevantLabels: string[];
  amount: number;
}

export interface BucketInfo {
  name: string;
  numTransactions: number;
  totalPositive: number;
  totalNegative: number;
  topLabels: [string, number][];
}
