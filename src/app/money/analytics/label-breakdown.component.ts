import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { ChartData, ChartTooltipCallback, ChartTooltipItem } from 'chart.js';
import { KeyedArrayAggregate, KeyedNumberAggregate } from '../../core/keyed-aggregate';
import { getRandomInt } from '../../core/util';
import { CurrencyService } from '../currency.service';
import { DataService } from '../data.service';
import { extractAllLabels, getDominantLabels, MONEY_EPSILON } from '../model-util';
import { BilledTransaction, LabelGroup, LABEL_HIERARCHY_SEPARATOR } from './analytics.component';
import { ChartElementClickEvent } from './chart.component';

const NONE_GROUP_NAME = '<none>';
const OTHER_GROUP_NAME = '<other>';

@Component({
  selector: 'app-label-breakdown',
  templateUrl: './label-breakdown.component.html',
  styleUrls: ['./label-breakdown.component.css']
})
export class LabelBreakdownComponent implements OnChanges {
  @Input()
  labelGroups: LabelGroup[] = [];
  @Input()
  billedTransactionBuckets: KeyedArrayAggregate<BilledTransaction>;

  /**
   * When the user clicks on any of the groups in the pie chart, emits the list
   * of label names in the clicked group. Collapsed labels end with '+'.
   */
  @Output()
  groupClick = new EventEmitter<string[]>();
  /** Same as groupClick, but emitted when user clicks while holding alt key. */
  @Output()
  groupAltClick = new EventEmitter<string[]>();

  /** Data for pie charts passed to the AppChart component. */
  chartData: [ChartData, ChartData] = [{}, {}];
  /** Tooltip config for pie charts passed to the AppChart component. */
  chartTooltipCallbacks: [ChartTooltipCallback, ChartTooltipCallback] = [
    this.makeChartTooltipCallbacks(0),
    this.makeChartTooltipCallbacks(1),
  ];
  /** List of labels that are shared by all matching transactions. */
  labelsSharedByAll: string[] = [];

  /** Maximum number of groups to display in charts. */
  private labelChartGroupLimits: [number, number] = [6, 6];

  constructor(
    private readonly currencyService: CurrencyService,
    private readonly dataService: DataService) { }

  ngOnChanges(changes: SimpleChanges) {
    this.analyzeLabelBreakdown();
  }

  canIncreaseGroupLimit(chartIndex: number): boolean {
    return this.chartData[chartIndex].labels !== undefined
      && this.chartData[chartIndex].labels!.includes(OTHER_GROUP_NAME);
  }

  canDecreaseGroupLimit(chartIndex: number): boolean {
    return this.labelChartGroupLimits[chartIndex] > 3
      && this.chartData[chartIndex].labels !== undefined
      && this.chartData[chartIndex].labels!.length > 3;
  }

  increaseGroupLimit(chartIndex: number) {
    this.labelChartGroupLimits[chartIndex] += 3;
    this.analyzeLabelBreakdown();
  }

  decreaseGroupLimit(chartIndex: number) {
    this.labelChartGroupLimits[chartIndex] = Math.max(3, this.labelChartGroupLimits[chartIndex] - 3);
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
    clickedLabels.unshift(...this.labelsSharedByAll);

    if (event.mouseEvent.altKey) {
      this.groupAltClick.emit(clickedLabels);
    } else {
      this.groupClick.emit(clickedLabels);
    }
  }

  private analyzeLabelBreakdown() {
    // Exclude labels from breakdown which every matched transaction is tagged with.
    const flatTransactionsView = Array.from(this.billedTransactionBuckets.getValuesFlat()).map(bt => bt.source);
    this.labelsSharedByAll = extractAllLabels(flatTransactionsView)
      .filter(label => flatTransactionsView.every(transaction => transaction.labels.includes(label)));

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

    const dominanceOrder = this.dataService.getUserSettings().labelDominanceOrder;

    // Group by labels.
    const expensesGroups = new KeyedNumberAggregate();
    const incomeGroups = new KeyedNumberAggregate();
    for (const billedTx of this.billedTransactionBuckets.getValuesFlat()) {
      const dominantLabels = getDominantLabels(billedTx.source.labels, dominanceOrder, this.labelsSharedByAll);
      const label = dominantLabels.length === 0 ? NONE_GROUP_NAME : dominantLabels
        // TODO This may potentially lead to duplicates, but I don't care right now because it is quite unlikely.
        .map(label => collapsedNames[label] || label)
        .join(',');

      if (billedTx.amount > MONEY_EPSILON) {
        incomeGroups.add(label, billedTx.amount);
      } else {
        expensesGroups.add(label, billedTx.amount);
      }
      // Transactions with amount exactly 0 are ignored.
    }

    this.chartData = [
      this.generateLabelBreakdownChart(expensesGroups, this.labelChartGroupLimits[0]),
      this.generateLabelBreakdownChart(incomeGroups, this.labelChartGroupLimits[1]),
    ];
  }

  private generateLabelBreakdownChart(groups: KeyedNumberAggregate, groupLimit: number): ChartData {
    // Collapse smallest groups into "other".
    if (groups.length > groupLimit) {
      const sortedEntries = groups.getEntries().sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]));
      const otherCount = groups.length - groupLimit + 1;
      let otherAmount = 0;
      for (let i = 0; i < otherCount; i++) {
        groups.delete(sortedEntries[i][0]);
        otherAmount += sortedEntries[i][1];
      }
      groups.add(OTHER_GROUP_NAME, otherAmount);
    }

    const descendingEntries = groups.getEntries().sort((a, b) =>
      // Always sort other as last entry.
      (Number(a[0] === OTHER_GROUP_NAME) - Number(b[0] === OTHER_GROUP_NAME))
      // Sort descending by amount.
      || Math.abs(b[1]) - Math.abs(a[1]));

    return {
      datasets: [{
        data: descendingEntries.map(entry => entry[1]),
        backgroundColor: descendingEntries.map(generateColor),
      }],
      labels: descendingEntries.map(entry => entry[0]),
    };
  }

  private makeChartTooltipCallbacks(chartIndex: 0 | 1): ChartTooltipCallback {
    return {
      title: (items: ChartTooltipItem[], data: ChartData) => {
        return data.labels![items[0].index!];
      },
      label: (item: ChartTooltipItem, data: ChartData) => {
        const allValues = <number[]>data.datasets![item.datasetIndex!].data;

        const value = allValues[item.index!];
        const percentage = value / allValues.reduce((a, b) => a + b, 0);
        const numMonths = this.billedTransactionBuckets.getKeys().length;
        const perMonth = value / numMonths;
        return [
          this.currencyService.format(value, this.dataService.getMainCurrency()) + ' total',
          numMonths > 1
            ? (this.currencyService.format(perMonth, this.dataService.getMainCurrency())
              + ` monthly mean (over ${numMonths} months)`)
            : '',
          (percentage * 100).toLocaleString('en-US',
            { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' %',
        ].filter(line => !!line);
      },
    }
  }
}

function generateColor(): string {
  return 'rgb('
    + getRandomInt(0, 256) + ','
    + getRandomInt(0, 256) + ','
    + getRandomInt(0, 256) + ')';
}
