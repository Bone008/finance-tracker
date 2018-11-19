import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { DataService } from '../../data.service';

export type LabelDominanceOrder = { [label: string]: number };

@Component({
  selector: 'app-dialog-label-dominance',
  templateUrl: './dialog-label-dominance.component.html',
  styleUrls: ['./dialog-label-dominance.component.css']
})
export class DialogLabelDominanceComponent implements OnInit {
  readonly allLabels: string[];
  readonly dominanceOrder: LabelDominanceOrder;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: { dominanceOrder: LabelDominanceOrder },
    dataService: DataService,
    private readonly matDialogRef: MatDialogRef<DialogLabelDominanceComponent>
  ) {
    this.allLabels = dataService.getAllLabels().sort();
    this.dominanceOrder = data.dominanceOrder;
  }

  ngOnInit() {
  }

  getValueForLabel(label: string): number {
    return this.dominanceOrder[label] || 0;
  }

  setValueForLabel(label: string, value: number) {
    this.dominanceOrder[label] = value;
  }

  onSubmit() {
    this.matDialogRef.close(true);
  }
}
