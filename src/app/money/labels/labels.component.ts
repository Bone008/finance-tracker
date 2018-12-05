import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BillingInfo, LabelConfig } from '../../../proto/model';
import { DataService } from '../data.service';

interface LabelInfo {
  name: string;
  numTransactions: number;
  firstTransactionTime?: Date;
  lastTransactionTime?: Date;
}

@Component({
  selector: 'app-labels',
  templateUrl: './labels.component.html',
  styleUrls: ['./labels.component.css']
})
export class LabelsComponent implements OnInit {
  allLabels$: Observable<LabelInfo[]>;

  /** Stores LabelConfig instances for the UI of labels that have no associated instance yet. */
  private transientConfigInstances: { [label: string]: LabelConfig } = {};

  constructor(private readonly dataService: DataService) { }

  ngOnInit() {
    this.allLabels$ = this.dataService.transactions$
      .pipe(map(() => this.dataService.getAllLabels()
        .sort()
        .map(labelName => <LabelInfo>{
          name: labelName,
          numTransactions: this.dataService.getCurrentTransactionList().filter(t => t.labels.includes(labelName)).length,
        })));
  }

  getBillingForLabel(label: string): BillingInfo {
    const config = this.getConfigForLabel(label);
    if (!config.billing) config.billing = new BillingInfo({ isRelative: true });
    return config.billing;
  }

  updateBillingForLabel(label: string, billing: BillingInfo) {
    this.dataService.getOrCreateLabelConfig(label).billing = billing;
  }

  // TODO: This model makes simple scalar properties quite annoying to update.
  private getConfigForLabel(label: string): LabelConfig {
    const config = this.dataService.getLabelConfig(label);
    if (config) return config;

    if (this.transientConfigInstances.hasOwnProperty(label)) {
      return this.transientConfigInstances[label];
    } else {
      return this.transientConfigInstances[label] = new LabelConfig();
    }
  }
}
