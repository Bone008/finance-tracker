import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { LoggerService } from 'src/app/core/logger.service';
import { BillingInfo, LabelConfig } from '../../../proto/model';
import { DataService } from '../data.service';

interface LabelInfo {
  name: string;
  numTransactions: number;
}

@Component({
  selector: 'app-labels',
  templateUrl: './labels.component.html',
  styleUrls: ['./labels.component.css']
})
export class LabelsComponent implements OnInit {
  allLabels$: Observable<LabelInfo[]>;

  /** Stores LabelConfig instances for the UI of labels that have no associated instance yet. */
  private configInstancesCache: { [label: string]: LabelConfig } = {};

  constructor(
    private readonly dataService: DataService,
    private readonly logger: LoggerService) { }

  ngOnInit() {
    this.allLabels$ = this.dataService.transactions$
      .pipe(map(() => this.dataService.getAllLabels()
        .sort()
        .map(labelName => <LabelInfo>{
          name: labelName,
          numTransactions: this.dataService.getCurrentTransactionList().filter(t => t.labels.includes(labelName)).length,
        })));
  }

  setDisplayColorEnabled(label: string, enabled: boolean) {
    this.getConfigForLabel(label).displayColor = enabled ? '#ffffff' : '';
  }

  isDisplayColorEnabled(label: string): boolean {
    return this.getConfigForLabel(label).displayColor !== '';
  }

  getConfigForLabel(label: string): LabelConfig {
    if (this.configInstancesCache.hasOwnProperty(label)) {
      return this.configInstancesCache[label];
    }

    // If already persisted --> cache and return.
    const config = this.dataService.getLabelConfig(label);
    if (config) {
      this.configInstancesCache[label] = config;
      return config;
    }

    this.logger.debug(`[LABELS] creating proxy for ${label}.`);
    // Otherwise create a transient config, and proxy setters to start
    // persisting the config as soon as the user changes any property.
    const transientObj = new LabelConfig({
      billing: new BillingInfo({ isRelative: true }),
    });
    const proxy = new Proxy(transientObj, {
      set: (obj, prop, value) => {
        obj[prop] = value;
        this.persistTransientConfig(label, obj);
        return true;
      },
    });
    this.configInstancesCache[label] = proxy;
    return proxy;
  }

  private persistTransientConfig(label: string, config: LabelConfig) {
    this.dataService.setLabelConfig(label, config);
    // Remove proxy.
    this.configInstancesCache[label] = config;

    this.logger.debug(`[LABELS] persisting ${label} because of value change.`);
  }
}
