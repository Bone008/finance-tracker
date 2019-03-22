import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { ChartData, ChartDataSets } from 'chart.js';
import { KeyedArrayAggregate } from 'src/app/core/keyed-aggregate';
import { BilledTransaction } from './analytics.component';

@Component({
  selector: 'app-bucket-breakdown',
  templateUrl: './bucket-breakdown.component.html',
  styleUrls: ['./bucket-breakdown.component.css']
})
export class BucketBreakdownComponent implements OnChanges {
  @Input()
  billedTransactionBuckets: KeyedArrayAggregate<BilledTransaction>;

  /** Emits the name of a bucket when the user clicks on it. */
  @Output()
  bucketClick = new EventEmitter<string>();
  /** Same as bucketClick, but emitted when user clicks while holding alt key. */
  @Output()
  bucketAltClick = new EventEmitter<string>();

  buckets: BucketInfo[] = [];
  monthlyChartData: ChartData = {};
  monthlyMeanBucket: Partial<BucketInfo> = {};
  monthlyMedianBucket: Partial<BucketInfo> = {};

  ngOnChanges(changes: SimpleChanges) {
    this.analyzeMonthlyBreakdown();
  }

  onBucketClick(bucketIndex: number, isAlt: boolean) {
    // e.g. '2018-01'
    const bucketName = String(this.monthlyChartData.labels![bucketIndex]);
    if (isAlt) {
      this.bucketAltClick.emit(bucketName);
    } else {
      this.bucketClick.emit(bucketName);
    }
  }

  private analyzeMonthlyBreakdown() {
    this.buckets = [];
    for (const [key, billedTransactions] of this.billedTransactionBuckets.getEntriesSorted()) {
      const positive = billedTransactions.filter(t => t.amount > 0);
      const negative = billedTransactions.filter(t => t.amount < 0);

      this.buckets.push({
        name: key,
        numTransactions: billedTransactions.length,
        totalPositive: positive.map(t => t.amount).reduce((a, b) => a + b, 0),
        totalNegative: negative.map(t => t.amount).reduce((a, b) => a + b, 0),
      });
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

}

/** Contains aggregate data about a date bucket. */
export interface BucketInfo {
  name: string;
  numTransactions: number;
  totalPositive: number;
  totalNegative: number;
}
