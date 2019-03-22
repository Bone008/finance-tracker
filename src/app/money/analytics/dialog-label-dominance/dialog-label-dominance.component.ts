import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { environment } from 'src/environments/environment';
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
  readonly labelsViewModel: LabelCombinationsInfo[][];
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

    // Group entries by those occuring together anywhere (find connected components).
    const connectedComponents: Set<string>[] = [];
    /** Set of labels that are not combined with any other label. */
    const isolatedLabels = new Set<string>();
    let activeComponent: Set<string>;
    const unseenSet = new Set<string>(labelCombinations.getKeys());
    while (unseenSet.size > 0) {
      // Grab any label out of the remaining ones.
      const startingLabel = unseenSet.values().next().value;
      unseenSet.delete(startingLabel);

      // Start a graph search through the combinations, add them to the active component.
      // Because we are using 'open' as a LIFO stack, this is effectively a DFS.
      const open = [startingLabel];
      activeComponent = new Set<string>();
      while (open.length > 0) {
        const label = open.pop()!;
        activeComponent.add(label);
        const neighbors = labelCombinations.get(label)!;
        for (const neighbor of Array.from(neighbors)) {
          // Add only unvisited neighbors to 'open' list.
          if (unseenSet.delete(neighbor)) {
            open.push(neighbor);
          }
        }
      }

      // Finalize this component.
      if (activeComponent.size > 1) {
        connectedComponents.push(activeComponent);
      } else {
        isolatedLabels.add(startingLabel);
      }
    }

    // Sort by size and add isolated as final component.
    connectedComponents.sort((a, b) => a.size - b.size);
    connectedComponents.push(isolatedLabels);
    // Sanity check.
    if (!environment.production) {
      const totalSize = connectedComponents.reduce((acc, x) => acc + x.size, 0);
      console.assert(totalSize === labelCombinations.length,
        "partitioned graph should contain every label exactly once");
    }

    this.labelsViewModel = connectedComponents.map(component =>
      Array.from(component).sort().map(label => ({
        label,
        combinations: Array.from(labelCombinations.get(label)!),
        dominanceValue: this.dominanceOrder[label] || 0,
      }))
    );
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
    for (const group of this.labelsViewModel) {
      for (const labelInfo of group) {
        this.dominanceOrder[labelInfo.label] = labelInfo.dominanceValue;
      }
    }
    this.matDialogRef.close(true);
  }
}
