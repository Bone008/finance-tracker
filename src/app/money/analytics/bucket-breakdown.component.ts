import { AfterViewInit, Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { ChartData, ChartDataSets, ChartTooltipCallback } from 'chart.js';
import { sortByAll } from 'src/app/core/util';
import { CurrencyService } from '../currency.service';
import { DataService } from '../data.service';
import { AnalysisResult, OTHER_GROUP_NAME } from './types';

/** Contains aggregate data about a date bucket. */
export interface BucketTableRow {
  name: string;
  numTransactions: number;
  totalPositive: number;
  /** >0 so sorting works properly. The minus is only added in the view. */
  totalNegative: number;
  balance: number;
}

@Component({
  selector: 'app-bucket-breakdown',
  templateUrl: './bucket-breakdown.component.html',
  styleUrls: ['./bucket-breakdown.component.scss']
})
export class BucketBreakdownComponent implements AfterViewInit, OnChanges {
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
  set showLabels(value: boolean) { this._showLabels = value; this.analyzeBreakdown(); }

  private _chartType: 'line' | 'bar' = 'bar';
  get chartType() { return this._chartType; }
  set chartType(value: 'line' | 'bar') { this._chartType = value; this.analyzeBreakdown(); }

  // For chart view.
  chartDataCombined: ChartData = {};
  chartDataExpenses: ChartData = {};
  chartDataIncome: ChartData = {};
  chartTooltipCallback = this.makeTooltipCallback();

  // For table view.
  readonly bucketColumnNames = ['name', 'numTransactions', 'totalNegative', 'totalPositive', 'balance'] as const;
  readonly bucketRowsSource = new MatTableDataSource<BucketTableRow>([]);
  aggregateBucketRows: BucketTableRow[] = [];
  @ViewChild(MatSort) bucketRowsSort: MatSort;

  constructor(
    private readonly currencySerivce: CurrencyService,
    private readonly dataService: DataService) { }

  ngAfterViewInit() {
    this.bucketRowsSort.direction;
    this.bucketRowsSource.sort = this.bucketRowsSort;
  }

  ngOnChanges(changes: SimpleChanges) {
    this.analyzeBreakdown();
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

  private analyzeBreakdown() {
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
              ...(this.chartType === 'line'
                ? { borderColor: this.analysisResult.labelGroupColorsByName[label], fill: false }
                : { backgroundColor: this.analysisResult.labelGroupColorsByName[label], fill: true }),
              stack: type,
            });
          }
        }
      }
    } else {
      if (this.analysisResult.buckets.some(b => b.totalExpenses !== 0))
        datasetsExpenses.push({
          data: this.analysisResult.buckets.map(b => -b.totalExpenses),
          label: 'Expenses',
          ...(this.chartType === 'line'
            ? { borderColor: 'red', fill: false }
            : { backgroundColor: 'red', fill: true }),
          stack: 'Expenses',
        });
      if (this.analysisResult.buckets.some(b => b.totalIncome !== 0))
        datasetsIncome.push({
          data: this.analysisResult.buckets.map(b => b.totalIncome),
          label: 'Income',
          ...(this.chartType === 'line'
            ? { borderColor: 'blue', fill: false }
            : { backgroundColor: 'blue', fill: true }),
          stack: 'Income',
        });
    }

    const bucketNames = this.analysisResult.buckets.map(b => b.name);
    this.chartDataCombined = { labels: bucketNames, datasets: datasetsExpenses.concat(datasetsIncome) };
    this.chartDataExpenses = { labels: bucketNames, datasets: datasetsExpenses };
    this.chartDataIncome = { labels: bucketNames, datasets: datasetsIncome };

    // Calculate aggregates, but only if there are at least 2 buckets (= rows).
    if (this.analysisResult.buckets.length >= 2) {
      const aggNames = ['Total', 'Mean', 'Median'];
      const aggNum = this.calculateTotalMeanMedian(this.analysisResult.buckets.map(b => b.billedTransactions.length));
      const aggPos = this.calculateTotalMeanMedian(this.analysisResult.buckets.map(b => b.totalIncome));
      const aggNeg = this.calculateTotalMeanMedian(this.analysisResult.buckets.map(b => b.totalExpenses));
      const aggBal = this.calculateTotalMeanMedian(this.analysisResult.buckets.map(b => b.totalIncome + b.totalExpenses));

      this.aggregateBucketRows = aggNames.map((name, i) => ({
        name,
        numTransactions: aggNum[i],
        totalPositive: aggPos[i],
        totalNegative: -aggNeg[i],
        balance: aggBal[i],
      } as BucketTableRow));
    } else {
      this.aggregateBucketRows = [];
    }

    this.bucketRowsSource.data = this.analysisResult.buckets.map(b => ({
      name: b.name,
      numTransactions: b.billedTransactions.length,
      totalPositive: b.totalIncome,
      totalNegative: -b.totalExpenses,
      balance: b.totalIncome + b.totalExpenses,
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

  private makeTooltipCallback(): ChartTooltipCallback {
    return {
      beforeBody: (items, data) => {
        if (!this.showLabels) return [];
        const sum = items.map(item => Number(item.value)).reduce((a, x) => a + x);
        return [
          data.datasets![items[0].datasetIndex!].stack + ' total: ' + this.currencySerivce.format(sum, this.dataService.getMainCurrency()),
          '',
        ];
      },
      labelColor: (item, chart) => {
        const dataset = chart.data.datasets![item.datasetIndex!];
        return {
          // Remap either borderColor or backgroundColor to the backgroundColor
          // of the tooltip item.
          backgroundColor: (dataset.borderColor || dataset.backgroundColor) as string,
          borderColor: 'rgba(255, 255, 255, 0.2)',
        };
      },
    };
  }
}
