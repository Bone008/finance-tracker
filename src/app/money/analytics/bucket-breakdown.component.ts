import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { ChartData, ChartDataSets } from 'chart.js';
import { sortByAll } from 'src/app/core/util';
import { AnalysisResult, OTHER_GROUP_NAME } from './types';

@Component({
  selector: 'app-bucket-breakdown',
  templateUrl: './bucket-breakdown.component.html',
  styleUrls: ['./bucket-breakdown.component.css']
})
export class BucketBreakdownComponent implements OnChanges {
  @Input()
  analysisResult: AnalysisResult;

  /** Emits the name of a bucket when the user clicks on it. */
  @Output()
  bucketClick = new EventEmitter<string>();
  /** Same as bucketClick, but emitted when user clicks while holding alt key. */
  @Output()
  bucketAltClick = new EventEmitter<string>();

  showCombined = false;
  private _showLabels = true;
  get showLabels() { return this._showLabels; }
  set showLabels(value: boolean) { this._showLabels = value; this.analyzeMonthlyBreakdown(); }

  // For chart view.
  chartDataCombined: ChartData = {};
  chartDataExpenses: ChartData = {};
  chartDataIncome: ChartData = {};
  // For table view.
  bucketRows: BucketTableRow[] = [];
  aggregateBucketRows: BucketTableRow[] = [];

  ngOnChanges(changes: SimpleChanges) {
    this.analyzeMonthlyBreakdown();
  }

  onBucketClick(bucketIndex: number, isAlt: boolean) {
    // e.g. '2018-01'
    const bucketName = String(this.chartDataCombined.labels![bucketIndex]);
    if (isAlt) {
      this.bucketAltClick.emit(bucketName);
    } else {
      this.bucketClick.emit(bucketName);
    }
  }

  private analyzeMonthlyBreakdown() {
    const datasetsExpenses: ChartDataSets[] = [];
    const datasetsIncome: ChartDataSets[] = [];

    if (this.showLabels) {
      const props = [
        { type: 'Expenses', summedProp: 'summedTotalExpensesByLabel', bucketProp: 'totalExpensesByLabel', multiplier: -1, datasets: datasetsExpenses },
        { type: 'Income', summedProp: 'summedTotalIncomeByLabel', bucketProp: 'totalIncomeByLabel', multiplier: 1, datasets: datasetsIncome },
      ] as const;
      for (const { type, summedProp, bucketProp, multiplier, datasets } of props) {
        const sortedLabels = sortByAll(this.analysisResult.labelGroupNames.slice(), [
          label => label === OTHER_GROUP_NAME,
          label => Math.abs(this.analysisResult[summedProp].get(label) || 0),
        ], ['asc', 'desc']);
        for (const label of sortedLabels) {
          const data = this.analysisResult.buckets.map(b => multiplier * (b[bucketProp].get(label) || 0));
          if (data.some(v => v !== 0)) {
            datasets.push({
              data,
              label: type + ' ' + label,
              backgroundColor: this.analysisResult.labelGroupColorsByName[label],
              stack: type,
            });
          }
        }
      }
    }
    else {
      if (this.analysisResult.buckets.some(b => b.totalExpenses !== 0))
        datasetsExpenses.push({
          data: this.analysisResult.buckets.map(b => -b.totalExpenses),
          label: 'Expenses',
          backgroundColor: 'red',
          stack: 'Expenses',
        });
      if (this.analysisResult.buckets.some(b => b.totalIncome !== 0))
        datasetsIncome.push({
          data: this.analysisResult.buckets.map(b => b.totalIncome),
          label: 'Income',
          backgroundColor: 'blue',
          stack: 'Income',
        });
    }

    const bucketNames = this.analysisResult.buckets.map(b => b.name);
    this.chartDataCombined = { labels: bucketNames, datasets: datasetsExpenses.concat(datasetsIncome) };
    this.chartDataExpenses = { labels: bucketNames, datasets: datasetsExpenses };
    this.chartDataIncome = { labels: bucketNames, datasets: datasetsIncome };

    // Calculate mean and median.
    const aggNames = ['Total', 'Mean', 'Median'];
    const aggPos = this.calculateTotalMeanMedian(this.analysisResult.buckets.map(b => b.totalIncome));
    const aggNeg = this.calculateTotalMeanMedian(this.analysisResult.buckets.map(b => b.totalExpenses));
    const aggNum = this.calculateTotalMeanMedian(this.analysisResult.buckets.map(b => b.billedTransactions.length));

    this.bucketRows = this.analysisResult.buckets.map(b => ({
      name: b.name,
      totalPositive: b.totalIncome,
      totalNegative: b.totalExpenses,
      numTransactions: b.billedTransactions.length,
    } as BucketTableRow));
    this.aggregateBucketRows = aggNames.map((name, i) => ({
      name,
      totalPositive: aggPos[i],
      totalNegative: aggNeg[i],
      numTransactions: aggNum[i],
    } as BucketTableRow));
  }

  private calculateTotalMeanMedian(numbers: number[]): [number, number, number] {
    if (numbers.length === 0) return [NaN, NaN, NaN];
    const total = numbers.reduce((a, b) => a + b, 0);
    const mean = total / numbers.length;

    let median: number;
    const sorted = numbers.slice(0).sort((a, b) => a - b);
    if (sorted.length % 2 === 0) {
      median = (sorted[(sorted.length >> 1) - 1] + sorted[sorted.length >> 1]) / 2;
    } else {
      median = sorted[sorted.length >> 1];
    }
    return [total, mean, median];
  }

}

/** Contains aggregate data about a date bucket. */
export interface BucketTableRow {
  name: string;
  totalPositive: number;
  totalNegative: number;
  numTransactions: number;
}
