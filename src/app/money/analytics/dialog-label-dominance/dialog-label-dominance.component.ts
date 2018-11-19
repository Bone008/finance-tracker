import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { KeyedSetAggregate } from '../../../core/keyed-aggregate';
import { DataService } from '../../data.service';

export type LabelDominanceOrder = { [label: string]: number };

export interface LabelCombinationsInfo {
  label: string;
  combinations: string[];
  dominanceValue: number;
}

@Component({
  selector: 'app-dialog-label-dominance',
  templateUrl: './dialog-label-dominance.component.html',
  styleUrls: ['./dialog-label-dominance.component.css']
})
export class DialogLabelDominanceComponent implements OnInit {
  readonly labelsWithCombinations: LabelCombinationsInfo[];
  private readonly dominanceOrder: LabelDominanceOrder;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: { dominanceOrder: LabelDominanceOrder },
    dataService: DataService,
    private readonly matDialogRef: MatDialogRef<DialogLabelDominanceComponent>
  ) {
    this.dominanceOrder = data.dominanceOrder;

    // Build matrix of labels that occur together within a single transaction.
    const labelCombinations = new KeyedSetAggregate<string>();
    for (const transaction of dataService.getCurrentTransactionList()) {
      for (let i = 0; i < transaction.labels.length; i++) {
        // Aggregate for each label all other labels. Note that even adding []
        // to the aggregate registers the key as an entry, so in the end we get
        // all labels.
        labelCombinations.addMany(transaction.labels[i], transaction.labels.slice(0, i));
        labelCombinations.addMany(transaction.labels[i], transaction.labels.slice(i + 1));
      }
    }

    this.labelsWithCombinations = labelCombinations.getEntries().map(entry => ({
      label: entry[0],
      combinations: Array.from(entry[1]).sort(),
      dominanceValue: this.dominanceOrder[entry[0]] || 0,
    })).sort((a, b) => (a.label < b.label ? -1 : 1));
  }

  ngOnInit() {
  }

  formatLabelTooltip(labelInfo: LabelCombinationsInfo) {
    if (labelInfo.combinations.length > 0) {
      return 'Used together with: ' + labelInfo.combinations.join(', ');
    } else {
      return 'Never used together with other labels.';
    }
  }

  onSubmit() {
    // Copy values from view model back into the object that was passed in.
    for (const labelInfo of this.labelsWithCombinations) {
      this.dominanceOrder[labelInfo.label] = labelInfo.dominanceValue;
    }
    this.matDialogRef.close(true);
  }
}
