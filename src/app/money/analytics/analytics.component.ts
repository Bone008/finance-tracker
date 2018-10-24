import { Component, OnDestroy, OnInit } from '@angular/core';
import { ChartData, ChartDataSets } from 'chart.js';
import * as moment from 'moment';
import { BehaviorSubject, combineLatest, Subscription } from 'rxjs';
import { Transaction } from '../../../proto/model';
import { timestampToMoment, timestampToWholeSeconds } from '../../core/proto-util';
import { maxBy } from '../../core/util';
import { DataService } from '../data.service';
import { FilterState } from '../filter-input/filter-state';
import { getTransactionAmount, isSingle } from '../model-util';
import { TransactionFilterService } from '../transaction-filter.service';

@Component({
  selector: 'app-analytics',
  templateUrl: './analytics.component.html',
  styleUrls: ['./analytics.component.css']
})
export class AnalyticsComponent implements OnInit, OnDestroy {
  readonly filterState = new FilterState();
  readonly averageOver3MonthsSubject = new BehaviorSubject<boolean>(false);
  totalTransactionCount = 0;
  matchingTransactionCount = 0;
  buckets: BucketInfo[] = [];
  maxBucketExpense = 0;
  monthlyChartData: ChartData = {};

  private txSubscription: Subscription;

  constructor(
    private readonly dataService: DataService,
    private readonly filterService: TransactionFilterService) { }

  ngOnInit() {
    this.txSubscription =
      combineLatest(this.dataService.transactions$, this.filterState.value$, this.averageOver3MonthsSubject)
        .subscribe(([_, filterValue, useAverage]) => this.analyzeTransactions(filterValue, useAverage));
  }

  ngOnDestroy() {
    this.txSubscription.unsubscribe();
  }

  analyzeTransactions(filterValue: string, useAverage: boolean) {
    const allTransactions = this.dataService.getCurrentTransactionList();
    const transactions = this.filterService.applyFilter(allTransactions, filterValue);
    this.totalTransactionCount = allTransactions.length;
    this.matchingTransactionCount = transactions.length;

    let bucketRangeMin: moment.Moment | null = null;
    let bucketRangeMax: moment.Moment | null = null;
    const transactionBuckets: { [key: string]: BilledTransaction[] } = {};
    const keyFormat = 'YYYY-MM';

    const getOrCreateTransactionBucket = (key: string) => {
      if (!transactionBuckets.hasOwnProperty(key)) {
        transactionBuckets[key] = [];
        const mom = moment(key);
        if (!bucketRangeMin || mom.isBefore(bucketRangeMin)) {
          bucketRangeMin = mom;
        }
        if (!bucketRangeMax || mom.isAfter(bucketRangeMax)) {
          bucketRangeMax = mom;
        }
      }
      return transactionBuckets[key];
    };

    const now = moment();

    for (const transaction of transactions) {
      const dateMoment = timestampToMoment(isSingle(transaction)
        ? transaction.single.date
        : maxBy(transaction.group!.children, child => timestampToWholeSeconds(child.date))!.date
      );

      const key = dateMoment.format(keyFormat);

      if (!useAverage) {
        getOrCreateTransactionBucket(key).push({
          source: transaction,
          relevantLabels: transaction.labels,
          amount: getTransactionAmount(transaction),
        });
      } else {
        //const contribBuckets = [key];
        // TODO: figure out which direction makes sense to shift the moving average
        const otherKey1 = dateMoment.clone().add(1, 'month').format(keyFormat);
        const otherKey2 = dateMoment.clone().subtract(1, 'month').format(keyFormat);
        //if (otherKey1 in transactionBuckets) contribBuckets.push(otherKey1);
        //if (otherKey2 in transactionBuckets) contribBuckets.push(otherKey2);

        const contribBuckets = [key, otherKey1, otherKey2];

        const amountPerBucket = getTransactionAmount(transaction) / contribBuckets.length;
        for (let buck of contribBuckets) {
          getOrCreateTransactionBucket(buck).push({
            source: transaction,
            relevantLabels: transaction.labels,
            amount: amountPerBucket,
          });
        }

      }
    }

    // Fix holes in transactionBuckets
    if (bucketRangeMin && bucketRangeMax) {
      for (let currentMoment = bucketRangeMin!; currentMoment.isBefore(bucketRangeMax, 'month'); currentMoment.add(1, 'month')) {
        getOrCreateTransactionBucket(currentMoment.format(keyFormat));
      }
    }

    this.buckets = [];
    for (const key of Object.keys(transactionBuckets).sort()) {
      const positive = transactionBuckets[key].filter(t => t.amount > 0);
      const negative = transactionBuckets[key].filter(t => t.amount < 0);

      // Aggregate labels by their contributing total amount.
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

    if (!useAverage) {
      this.maxBucketExpense = -Math.min(...this.buckets.map(b => b.totalNegative));
    }

    const datasets: ChartDataSets[] = [];
    if (this.buckets.some(b => b.totalNegative !== 0))
      datasets.push({ data: this.buckets.map(b => -b.totalNegative), label: 'Expenses', backgroundColor: 'red' });
    if (this.buckets.some(b => b.totalPositive !== 0))
      datasets.push({ data: this.buckets.map(b => b.totalPositive), label: 'Income', backgroundColor: 'blue' });

    this.monthlyChartData = {
      labels: this.buckets.map(b => b.name),
      datasets,
    };
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
