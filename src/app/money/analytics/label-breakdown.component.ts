import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { ChartData } from 'chart.js';
import { Transaction } from '../../../proto/model';
import { KeyedNumberAggregate } from '../../core/keyed-aggregate';
import { getRandomInt } from '../../core/util';
import { extractAllLabels, getTransactionAmount } from '../model-util';
import { LabelGroup, LABEL_HIERARCHY_SEPARATOR } from './analytics.component';

/** Maximum number of groups in label breakdown chart. */
const LABEL_CHART_GROUP_LIMIT = 6;

@Component({
  selector: 'app-label-breakdown',
  templateUrl: './label-breakdown.component.html',
  styleUrls: ['./label-breakdown.component.css']
})
export class LabelBreakdownComponent implements OnChanges {
  @Input()
  labelGroups: LabelGroup[] = [];
  @Input()
  transactions: Transaction[];

  /** Data for pie charts showing expenses/income by label. */
  labelBreakdownChartData: [ChartData, ChartData] = [{}, {}];
  /** List of labels that are shared by all matching transactions. */
  labelsSharedByAll: string[] = [];

  constructor() { }

  ngOnChanges(changes: SimpleChanges) {
    console.log('on changes');
    this.analyzeLabelBreakdown();
  }

  private analyzeLabelBreakdown() {
    // Exclude labels from breakdown which every matched transaction is tagged with.
    this.labelsSharedByAll = extractAllLabels(this.transactions)
      .filter(label => this.transactions.every(transaction => transaction.labels.includes(label)));

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
    for (const transaction of this.transactions) {
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

    const descendingEntries = groups.getEntries().sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    return {
      datasets: [{
        data: descendingEntries.map(entry => entry[1]),
        backgroundColor: descendingEntries.map(generateColor),
      }],
      labels: descendingEntries.map(entry => entry[0]),
    };
  }

}

function generateColor(): string {
  return 'rgb('
    + getRandomInt(0, 256) + ','
    + getRandomInt(0, 256) + ','
    + getRandomInt(0, 256) + ')';
}
