import { Component, OnDestroy, OnInit } from '@angular/core';
import { ChartData, ChartDataSets } from 'chart.js';
import * as moment from 'moment';
import { BehaviorSubject, combineLatest, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { BillingInfo, BillingType, Transaction } from '../../../proto/model';
import { KeyedArrayAggregate, KeyedNumberAggregate } from '../../core/keyed-aggregate';
import { protoDateToMoment, timestampToMoment, timestampToWholeSeconds } from '../../core/proto-util';
import { maxBy } from '../../core/util';
import { DataService } from '../data.service';
import { DialogService } from '../dialog.service';
import { FilterState } from '../filter-input/filter-state';
import { CanonicalBillingInfo, extractAllLabels, getCanonicalBilling, getTransactionAmount, getTransactionDominantLabels, isSingle } from '../model-util';
import { TransactionFilterService } from '../transaction-filter.service';
import { LabelDominanceOrder } from './dialog-label-dominance/dialog-label-dominance.component';

/** The character that is used in label names to define a hierarchy. */
export const LABEL_HIERARCHY_SEPARATOR = '/';

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
  private readonly labelDominanceSubject = new BehaviorSubject<LabelDominanceOrder>({});

  private static readonly uncollapsedLabels = new Set<string>();
  labelGroups: LabelGroup[] = [];

  matchingTransactions: Transaction[] = []; // This is the dataset that child components operate on.
  totalTransactionCount = 0;
  matchingTransactionCount = 0;
  buckets: BucketInfo[] = [];
  maxBucketExpense = 0;
  monthlyChartData: ChartData = {};
  monthlyMeanBucket: Partial<BucketInfo> = {};
  monthlyMedianBucket: Partial<BucketInfo> = {};

  private txSubscription: Subscription;

  constructor(
    private readonly dataService: DataService,
    private readonly filterService: TransactionFilterService,
    private readonly dialogService: DialogService) { }

  ngOnInit() {
    this.dataService.userSettings$
      .pipe(map(settings => settings.labelDominanceOrder))
      .subscribe(this.labelDominanceSubject);

    this.labelCollapseSubject.subscribe(() => this.refreshUncollapsedLabels());

    this.txSubscription =
      combineLatest(
        this.dataService.transactions$,
        this.filterState.value$,
        this.averageOver3MonthsSubject,
        this.labelCollapseSubject,
        this.labelDominanceSubject)
        .subscribe(([_, filterValue, useAverage, __, ___]) => this.analyzeTransactions(filterValue, useAverage));
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

  openLabelDominanceDialog() {
    const originalDominanceOrder = this.labelDominanceSubject.getValue();
    const dominanceOrder = Object.assign({}, originalDominanceOrder);

    this.dialogService.openAnalyticsLabelDominance(dominanceOrder)
      .afterConfirmed().subscribe(() => {
        this.dataService.getUserSettings().labelDominanceOrder = dominanceOrder;
        this.labelDominanceSubject.next(dominanceOrder);
      });
  }

  private analyzeTransactions(filterValue: string, useAverage: boolean) {
    const allTransactions = this.dataService.getCurrentTransactionList();
    this.matchingTransactions = this.filterService.applyFilter(allTransactions, filterValue);
    this.totalTransactionCount = allTransactions.length;
    this.matchingTransactionCount = this.matchingTransactions.length;

    this.analyzeLabelGroups();
    this.analyzeMonthlyBreakdown(useAverage);
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

  /**
   * Computes the list of parent labels that have sublabels and their collapsed
   * state and stores it into this.labelGroups.
   **/
  private analyzeLabelGroups() {
    const labels = extractAllLabels(this.matchingTransactions);
    const parentLabels = new KeyedArrayAggregate<string>();
    for (const label of labels) {
      const sepIndex = label.indexOf(LABEL_HIERARCHY_SEPARATOR);
      if (sepIndex > 0) {
        parentLabels.add(label.substr(0, sepIndex), label.substr(sepIndex + 1));
      } else {
        // Just a regular label, but it may be a parent to some other children.
        parentLabels.add(label, label);
      }
    }

    this.labelGroups = parentLabels.getEntries()
      .filter(entry => entry[1].length > 1)
      .map(entry => <LabelGroup>{
        parentName: entry[0],
        children: entry[1],
        shouldCollapse: !AnalyticsComponent.uncollapsedLabels.has(entry[0]),
      });
  }

  private analyzeMonthlyBreakdown(useAverage: boolean) {
    const displayUnit = 'month';
    const keyFormat = 'YYYY-MM';

    const transactionBuckets = new KeyedArrayAggregate<BilledTransaction>();

    const debugContribHistogram = new KeyedNumberAggregate();
    for (const transaction of this.matchingTransactions) {
      const billing = this.resolveBillingInfo(transaction);
      const fromMoment = protoDateToMoment(billing.date);
      const toMoment = protoDateToMoment(billing.endDate);

      // TODO: Handle "billing.isPeriodic".

      const contributingKeys: string[] = [];
      // Iterate over date units and collect their keys.
      // Start with the normalized version of fromMoment (e.g. for months,
      // 2018-05-22 is turned into 2018-05-01).
      const it = moment(fromMoment.format(keyFormat), keyFormat);
      while (it.isSameOrBefore(toMoment)) {
        contributingKeys.push(it.format(keyFormat));
        it.add(1, displayUnit);
      }

      debugContribHistogram.add(contributingKeys.length + "", 1);

      // TODO: For DAY billing granularity, we may want to consider proportional contributions to the months.
      const amountPerBucket = getTransactionAmount(transaction) / contributingKeys.length;
      for (const key of contributingKeys) {
        transactionBuckets.add(key, {
          source: transaction,
          relevantLabels: transaction.labels,
          amount: amountPerBucket,
        });
      }
    }

    console.log(debugContribHistogram.getEntries());

    // Fill holes in transactionBuckets with empty buckets.
    // Sort the keys alphanumerically as the keyFormat is big-endian.
    const sortedKeys = transactionBuckets.getKeys().sort();
    if (sortedKeys.length > 1) {
      const last = sortedKeys[sortedKeys.length - 1];
      const it = moment(sortedKeys[0]);
      while (it.isBefore(last)) {
        it.add(1, displayUnit);
        // Make sure each date unit (e.g. month) is represented as a bucket.
        transactionBuckets.addMany(it.format(keyFormat), []);
      }
    }

    this.buckets = [];
    for (const [key, billedTransactions] of transactionBuckets.getEntriesSorted()) {
      const positive = billedTransactions.filter(t => t.amount > 0);
      const negative = billedTransactions.filter(t => t.amount < 0);

      this.buckets.push({
        name: key,
        numTransactions: billedTransactions.length,
        totalPositive: positive.map(t => t.amount).reduce((a, b) => a + b, 0),
        totalNegative: negative.map(t => t.amount).reduce((a, b) => a + b, 0),
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

  private resolveBillingInfo(transaction: Transaction): CanonicalBillingInfo {
    // Initially assume unknown (default) billing.
    let resolvedBilling = new BillingInfo({ periodType: BillingType.UNKNOWN });

    // Check for individual billing config (overrides that inherited from labels).
    if (transaction.billing && transaction.billing.periodType !== BillingType.UNKNOWN) {
      resolvedBilling = transaction.billing;
    } else {
      // Check for billing config inherited from labels.
      // Of the dominant labels, the first present billing config will be applied
      // and the rest ignored.
      const dominanceOrder = this.dataService.getUserSettings().labelDominanceOrder;
      const dominantLabels = getTransactionDominantLabels(transaction, dominanceOrder);
      for (const label of dominantLabels) {
        const labelConfig = this.dataService.getLabelConfig(label);
        if (labelConfig && labelConfig.billing && labelConfig.billing.periodType !== BillingType.UNKNOWN) {
          resolvedBilling = labelConfig.billing;
          break;
        }
      }
    }

    // Get reference date.
    const dateMoment = timestampToMoment(isSingle(transaction)
      ? transaction.single.date
      : maxBy(transaction.group!.children, child => timestampToWholeSeconds(child.date))!.date
    );

    return getCanonicalBilling(resolvedBilling, dateMoment);
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
}
