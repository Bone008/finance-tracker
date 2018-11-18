import { Component, OnDestroy, OnInit } from '@angular/core';
import { ChartData, ChartDataSets } from 'chart.js';
import * as moment from 'moment';
import { BehaviorSubject, combineLatest, Subscription } from 'rxjs';
import { Transaction } from '../../../proto/model';
import { timestampToMoment, timestampToWholeSeconds } from '../../core/proto-util';
import { getRandomInt, maxBy } from '../../core/util';
import { DataService } from '../data.service';
import { FilterState } from '../filter-input/filter-state';
import { extractAllLabels, getTransactionAmount, isSingle } from '../model-util';
import { TransactionFilterService } from '../transaction-filter.service';
import { KeyedArrayAggregate, KeyedNumberAggregate } from './keyed-aggregate';

/** The character that is used in label names to define a hierarchy. */
const LABEL_HIERARCHY_SEPARATOR = '/';
/** Maximum number of groups in label breakdown chart. */
const LABEL_CHART_GROUP_LIMIT = 6;

@Component({
  selector: 'app-analytics',
  templateUrl: './analytics.component.html',
  styleUrls: ['./analytics.component.css']
})
export class AnalyticsComponent implements OnInit, OnDestroy {
  // TODO Split this component into multiple parts, possibly add "AnalyticsService" for shared functionality.

  readonly filterState = new FilterState();
  readonly averageOver3MonthsSubject = new BehaviorSubject<boolean>(false);
  readonly labelCollapseSubject = new BehaviorSubject<void>(void (0));

  static readonly uncollapsedLabels = new Set<string>();
  labelGroups: LabelGroup[] = [];

  totalTransactionCount = 0;
  matchingTransactionCount = 0;
  buckets: BucketInfo[] = [];
  maxBucketExpense = 0;
  monthlyChartData: ChartData = {};
  monthlyMeanBucket: Partial<BucketInfo> = {};
  monthlyMedianBucket: Partial<BucketInfo> = {};

  /** Data for pie charts showing expenses/income by label. */
  labelBreakdownChartData: [ChartData, ChartData] = [{}, {}];
  /** List of labels that are shared by all matching transactions. */
  labelsSharedByAll: string[] = [];

  private txSubscription: Subscription;

  constructor(
    private readonly dataService: DataService,
    private readonly filterService: TransactionFilterService) { }

  ngOnInit() {
    this.labelCollapseSubject.subscribe(() => this.refreshUncollapsedLabels());

    this.txSubscription =
      combineLatest(
        this.dataService.transactions$,
        this.filterState.value$,
        this.averageOver3MonthsSubject,
        this.labelCollapseSubject)
        .subscribe(([_, filterValue, useAverage, __]) => this.analyzeTransactions(filterValue, useAverage));
  }

  ngOnDestroy() {
    this.txSubscription.unsubscribe();
  }

  onChartBucketClick(monthIndex: number) {
    // e.g. '2018-01'
    const bucketName = this.monthlyChartData.labels![monthIndex];

    // TODO Refactor token operations into some utility method.
    const addedToken = 'date:' + bucketName;
    let newFilter = this.filterState.getCurrentValue();
    if (newFilter.length > 0) {
      newFilter += " " + addedToken;
    } else {
      newFilter = addedToken;
    }
    this.filterState.setValueNow(newFilter);
  }

  collapseAllGroups() {
    AnalyticsComponent.uncollapsedLabels.clear();
    this.labelGroups.forEach(group => group.shouldCollapse = true);
    this.labelCollapseSubject.next(void (0));
  }

  uncollapseAllGroups() {
    this.labelGroups.forEach(group => group.shouldCollapse = false);
    this.labelCollapseSubject.next(void (0));
  }

  private analyzeTransactions(filterValue: string, useAverage: boolean) {
    const allTransactions = this.dataService.getCurrentTransactionList();
    const transactions = this.filterService.applyFilter(allTransactions, filterValue);
    this.totalTransactionCount = allTransactions.length;
    this.matchingTransactionCount = transactions.length;

    this.analyzeLabelGroups(transactions);
    this.analyzeMonthlyBreakdown(transactions, useAverage);
    this.analyzeLabelBreakdown(transactions, filterValue);
  }

  private refreshUncollapsedLabels() {
    for (const group of this.labelGroups) {
      if (group.shouldCollapse) {
        AnalyticsComponent.uncollapsedLabels.delete(group.parentName);
      } else {
        AnalyticsComponent.uncollapsedLabels.add(group.parentName);
      }
    }
  }

  private analyzeLabelGroups(transactions: Transaction[]) {
    const labels = extractAllLabels(transactions);
    const parentLabels = new KeyedArrayAggregate<string>();
    for (const label of labels) {
      const sepIndex = label.indexOf(LABEL_HIERARCHY_SEPARATOR);
      if (sepIndex > 0) {
        parentLabels.add(label.substr(0, sepIndex), label.substr(sepIndex + 1));
      }
    }

    this.labelGroups = parentLabels.getEntries().map(entry => <LabelGroup>{
      parentName: entry[0],
      children: entry[1],
      shouldCollapse: !AnalyticsComponent.uncollapsedLabels.has(entry[0]),
    });
  }

  private analyzeMonthlyBreakdown(transactions: Transaction[], useAverage: boolean) {
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

    // Calculate mean and median.
    const [meanPositive, medianPositive] = this.calculateMeanAndMedian(this.buckets.map(b => b.totalPositive));
    const [meanNegative, medianNegative] = this.calculateMeanAndMedian(this.buckets.map(b => b.totalNegative));
    const [meanNum, medianNum] = this.calculateMeanAndMedian(this.buckets.map(b => b.numTransactions));
    this.monthlyMeanBucket.totalPositive = meanPositive;
    this.monthlyMeanBucket.totalNegative = meanNegative;
    this.monthlyMeanBucket.numTransactions = meanNum;
    this.monthlyMedianBucket.totalPositive = medianPositive;
    this.monthlyMedianBucket.totalNegative = medianNegative;
    this.monthlyMedianBucket.numTransactions = medianNum;
  }

  private calculateMeanAndMedian(numbers: number[]): [number, number] {
    if (numbers.length === 0) return [NaN, NaN];
    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;

    let median: number;
    const sorted = numbers.slice(0).sort((a, b) => a - b);
    if (sorted.length % 2 === 0) {
      median = (sorted[(sorted.length >> 1) - 1] + sorted[sorted.length >> 1]) / 2;
    } else {
      median = sorted[sorted.length >> 1];
    }
    return [mean, median];
  }

  private analyzeLabelBreakdown(transactions: Transaction[], filterValue: string) {
    // Exclude labels from breakdown which every matched transaction is tagged with.
    this.labelsSharedByAll = extractAllLabels(transactions)
      .filter(label => transactions.every(transaction => transaction.labels.includes(label)));

    // Build index of label collapse for better complexity while grouping.
    const collapsedNames: { [fullLabel: string]: string } = {};
    for (const group of this.labelGroups) {
      if (group.shouldCollapse) {
        collapsedNames[group.parentName] = group.parentName + '+';
        for (const child of group.children) {
          collapsedNames[group.parentName + LABEL_HIERARCHY_SEPARATOR + child] = group.parentName + '+';
        }
      }
    }

    // Group by labels.
    const expensesGroups = new KeyedNumberAggregate();
    const incomeGroups = new KeyedNumberAggregate();
    for (const transaction of transactions) {
      const label = transaction.labels
        .filter(label => this.labelsSharedByAll.indexOf(label) === -1)
        // TODO This may potentially lead to duplicates, but I don't care right now because it is quite unlikely.
        .map(label => collapsedNames[label] || label)
        .join(',') || '<none>';
      const amount = getTransactionAmount(transaction);
      if (amount > 0) {
        incomeGroups.add(label, amount);
      } else {
        expensesGroups.add(label, amount);
      }
    }

    this.labelBreakdownChartData = [
      this.generateLabelBreakdownChart(expensesGroups),
      this.generateLabelBreakdownChart(incomeGroups),
    ];
  }

  private generateLabelBreakdownChart(groups: KeyedNumberAggregate): ChartData {
    // Collapse smallest groups into "other".
    if (groups.length > LABEL_CHART_GROUP_LIMIT) {
      const sortedEntries = groups.getEntries().sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]));
      const otherCount = groups.length - LABEL_CHART_GROUP_LIMIT + 1;
      let otherAmount = 0;
      for (let i = 0; i < otherCount; i++) {
        groups.delete(sortedEntries[i][0]);
        otherAmount += sortedEntries[i][1];
      }
      groups.add('other', otherAmount);
    }

    return {
      datasets: [{
        data: groups.getValues(),
        backgroundColor: groups.getKeys().map(generateColor),
      }],
      labels: groups.getKeys(),
    };
  }

}

function generateColor(): string {
  return 'rgb('
    + getRandomInt(0, 256) + ','
    + getRandomInt(0, 256) + ','
    + getRandomInt(0, 256) + ')';
}

/** Provides data about a label with sublabels (induced label hierarchy). */
export interface LabelGroup {
  parentName: string;
  children: string[];
  shouldCollapse: boolean;
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
