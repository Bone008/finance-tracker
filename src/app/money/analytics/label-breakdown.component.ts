import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { ChartData, ChartTooltipCallback, ChartTooltipItem } from 'chart.js';
import { pluralize, sortByAll } from 'src/app/core/util';
import { KeyedNumberAggregate } from '../../core/keyed-aggregate';
import { CurrencyService } from '../currency.service';
import { DataService } from '../data.service';
import { ChartElementClickEvent } from './chart.component';
import { AnalysisResult, NONE_GROUP_NAME, OTHER_GROUP_NAME } from './types';

@Component({
  selector: 'app-label-breakdown',
  templateUrl: './label-breakdown.component.html',
  styleUrls: ['./label-breakdown.component.css']
})
export class LabelBreakdownComponent implements OnChanges {
  @Input()
  analysisResult: AnalysisResult;

  /**
   * When the user clicks on any of the groups in the pie chart, emits the list
   * of label names in the clicked group. Collapsed labels end with '+'.
   */
  @Output()
  groupClick = new EventEmitter<string[]>();
  /** Same as groupClick, but emitted when user clicks while holding alt key. */
  @Output()
  groupAltClick = new EventEmitter<string[]>();

  /** Whether there exists any data in chartData below. */
  hasData: [boolean, boolean] = [false, false];
  /** Data for pie charts passed to the AppChart component. */
  chartData: [ChartData, ChartData] = [{}, {}];
  /** Tooltip config for pie charts passed to the AppChart component. */
  chartTooltipCallbacks: [ChartTooltipCallback, ChartTooltipCallback] = [
    this.makeChartTooltipCallbacks(0),
    this.makeChartTooltipCallbacks(1),
  ];

  constructor(
    private readonly currencyService: CurrencyService,
    private readonly dataService: DataService) { }

  ngOnChanges(changes: SimpleChanges) {
    this.analyzeLabelBreakdown();
  }

  onElementClick(chartIndex: number, event: ChartElementClickEvent) {
    const clickedGroup = <string>this.chartData[chartIndex].labels![event.index];
    if (clickedGroup === OTHER_GROUP_NAME) {
      // Ignore clicks on "other" aggregate group.
      return;
    }
    let clickedLabels: string[];
    if (clickedGroup === NONE_GROUP_NAME) {
      clickedLabels = [];
    } else {
      clickedLabels = clickedGroup.split(',');
    }
    clickedLabels.unshift(...this.analysisResult.excludedLabels);

    if (event.mouseEvent.altKey) {
      this.groupAltClick.emit(clickedLabels);
    } else {
      this.groupClick.emit(clickedLabels);
    }
  }

  private analyzeLabelBreakdown() {
    const expensesGroups = this.analysisResult.summedTotalExpensesByLabel;
    const incomeGroups = this.analysisResult.summedTotalIncomeByLabel;

    this.hasData = [expensesGroups.length > 0, incomeGroups.length > 0];
    this.chartData = [
      this.generateLabelBreakdownChart(expensesGroups),
      this.generateLabelBreakdownChart(incomeGroups),
    ];
  }

  private generateLabelBreakdownChart(groups: KeyedNumberAggregate): ChartData {
    const sortedEntries = sortByAll(groups.getEntries(), [
      // Always sort other as last entry.
      ([name, _]) => name === OTHER_GROUP_NAME,
      ([_, amount]) => Math.abs(amount),
    ], ['asc', 'desc']);
    const groupBackgrounds = sortedEntries.map(([name, _]) => this.analysisResult.labelGroupColorsByName[name]);

    return {
      datasets: [{
        data: sortedEntries.map(entry => entry[1]),
        backgroundColor: groupBackgrounds,
      }],
      labels: sortedEntries.map(entry => entry[0]),
    };
  }

  private makeChartTooltipCallbacks(chartIndex: 0 | 1): ChartTooltipCallback {
    return {
      title: (items: ChartTooltipItem[], data: ChartData) => {
        return items[0] && String(data.labels![items[0].index!]);
      },
      label: (item: ChartTooltipItem, data: ChartData) => {
        const allValues = <number[]>data.datasets![item.datasetIndex!].data;
        const value = allValues[item.index!];
        const label = String(data.labels![item.index!]);

        const percentage = value / allValues.reduce((a, b) => a + b, 0);
        const numBuckets = this.analysisResult.buckets.length;
        const numPresentBuckets = this.analysisResult.buckets.filter(bucket => {
          const agg = value > 0 ? bucket.totalIncomeByLabel : bucket.totalExpensesByLabel;
          return agg.has(label);
        }).length;
        const perBucket = value / numBuckets;
        const perPresentBucket = value / numPresentBuckets;
        return [
          this.currencyService.format(value, this.dataService.getMainCurrency()) + ' total',
          numBuckets > 1
            ? (this.currencyService.format(perBucket, this.dataService.getMainCurrency())
              + ` mean (over ${pluralize(numBuckets, this.analysisResult.bucketUnit)})`)
            : '',
          numPresentBuckets > 0 && numPresentBuckets !== numBuckets
            ? (this.currencyService.format(perPresentBucket, this.dataService.getMainCurrency())
              + ` mean (over ${pluralize(numPresentBuckets, 'non-zero ' + this.analysisResult.bucketUnit)})`)
            : '',
          (percentage * 100).toLocaleString('en-US',
            { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %',
        ].filter(line => !!line);
      },
    }
  }
}
