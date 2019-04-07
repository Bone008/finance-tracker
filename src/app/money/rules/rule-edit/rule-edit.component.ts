import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { KeyedNumberAggregate, KeyedSetAggregate } from 'src/app/core/keyed-aggregate';
import { pluralize, pushDeduplicate, removeByValue } from 'src/app/core/util';
import { ProcessingAction, ProcessingRule, ProcessingTrigger, Transaction } from 'src/proto/model';
import { DataService } from '../../data.service';
import { FilterState } from '../../filter-input/filter-state';
import { TransactionFilterService } from '../../transaction-filter.service';

/**
 * In the transaction preview analysis, how many maximum label sets should be displayed,
 * before showing them as 'various'.
 */
const PREVIEW_MAX_LABEL_SETS = 4;

export interface RuleEditConfig {
  rule: ProcessingRule;
  editMode: 'add' | 'edit';
}
interface MatchingTxsDescription {
  description: string;
  labelSets: string[][];
}

@Component({
  selector: 'app-rule-edit',
  templateUrl: './rule-edit.component.html',
  styleUrls: ['./rule-edit.component.css']
})
export class RuleEditComponent implements OnInit {
  readonly rule: ProcessingRule;
  readonly editMode: 'add' | 'edit';
  readonly filterState = new FilterState();

  /** Analysis result of the set of transactions that currently match the filter. */
  matchingTxsInfo: MatchingTxsDescription;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: RuleEditConfig,
    private readonly dataService: DataService,
    private readonly filterService: TransactionFilterService,
    private readonly matDialogRef: MatDialogRef<RuleEditComponent>,
  ) {
    this.rule = data.rule;
    this.editMode = data.editMode;

    this.filterState.setValueNow(this.rule.filter);
    this.filterState.value$.subscribe(value => {
      // Update entity.
      this.rule.filter = value.trim();

      // Update preview of matching transactions.
      const txs = this.dataService.getCurrentTransactionList();
      const filteredTxs = this.filterService.applyFilter(txs, value);
      this.matchingTxsInfo = this.analyzeMatchingTransactions(filteredTxs, filteredTxs.length === txs.length);
    });

    // Initialize with at least 1 action.
    if (this.rule.actions.length === 0) {
      this.addAction();
    }
  }

  ngOnInit() {
  }

  get triggerAdded(): boolean { return this.rule.triggers.includes(ProcessingTrigger.ADDED); }
  set triggerAdded(value: boolean) { this.setTrigger(ProcessingTrigger.ADDED, value); }
  get triggerImported(): boolean { return this.rule.triggers.includes(ProcessingTrigger.IMPORTED); }
  set triggerImported(value: boolean) { this.setTrigger(ProcessingTrigger.IMPORTED, value); }
  get triggerModified(): boolean { return this.rule.triggers.includes(ProcessingTrigger.MODIFIED); }
  set triggerModified(value: boolean) { this.setTrigger(ProcessingTrigger.MODIFIED, value); }

  private setTrigger(trigger: ProcessingTrigger, value: boolean) {
    if (value) {
      pushDeduplicate(this.rule.triggers, trigger);
    } else {
      const index = this.rule.triggers.indexOf(trigger);
      if (index !== -1) {
        this.rule.triggers.splice(index, 1);
      }
    }
  }

  addAction() {
    this.rule.actions.push(new ProcessingAction({ addLabel: '' }));
  }

  removeAction(action: ProcessingAction) {
    removeByValue(this.rule.actions, action);
  }

  /** Helper to initialize the oneof field of an action. */
  setActionType(action: ProcessingAction, type: typeof ProcessingAction.prototype.type) {
    // Because protobus.js's static code support for oneofs is kinda wonky, we need to set both
    // the type property (which clears all other values, but doesn't initialize the new one) and
    // the desired oneof value (which does not clear other values).
    action.type = type;
    if (type === 'addLabel') { action.addLabel = ''; }
    else if (type === 'removeLabel') { action.removeLabel = ''; }
    else if (type === 'setField') { action.setField = new ProcessingAction.SetFieldData(); }
    else { console.warn('Unknown action type value: ', type); }
  }

  /**
   * Analyzes matching transactions and their label distribution.
   * Label distributions are reported as one of the following options:
      - all currently unlabeled
      - all labeled exactly `foobar`
      - labeled one of {foo, foo bar, <unlabeled>}
      - with x different label sets, but all including `foo`.
      - with x different label sets
   */
  private analyzeMatchingTransactions(matchingTransactions: Transaction[], isAll: boolean): MatchingTxsDescription {
    if (isAll) {
      return { description: 'all transactions', labelSets: [] };
    }

    let description = '';

    description += pluralize(matchingTransactions.length, 'transaction');
    description += ', ';

    // For each label, count how many times it appears.
    const countsByLabel = new KeyedNumberAggregate();
    let numUnlabeled = 0;
    for (const tx of matchingTransactions) {
      for (const label of tx.labels) {
        countsByLabel.add(label, 1);
      }
      if (tx.labels.length === 0) {
        numUnlabeled++;
      }
    }

    if (countsByLabel.length === 0) {
      description += 'all currently unlabeled';
      return { description, labelSets: [] };
    }

    const labelsInAll = countsByLabel.getKeys()
      .filter(label => countsByLabel.get(label) === matchingTransactions.length);
    // Check if all known labels occur in all transactions.
    if (labelsInAll.length === countsByLabel.length) {
      description += 'all labeled exactly';
      return { description, labelSets: [labelsInAll] };
    }

    // Compute set of each label combination per transaction.
    const allLabelSets = new KeyedSetAggregate<string>();
    for (const tx of matchingTransactions) {
      if (tx.labels.length > 0) {
        const setKey = tx.labels.slice().sort().join(',A,');
        // Kinda abusing the aggregate mechanic here, we just want each value to be the label set,
        // so we keep adding the same labels over and over again ...
        allLabelSets.addMany(setKey, tx.labels);
      } else {
        allLabelSets.add('<unlabeled>', '<unlabeled>');
      }
    }

    // List label sets explicitly if they are below threshold.
    if (allLabelSets.length <= PREVIEW_MAX_LABEL_SETS) {
      description += 'labeled one of';
      return {
        description,
        labelSets: allLabelSets.getValues().map(set => Array.from(set).sort())
      };
    }

    description += `with ${allLabelSets.length} different label sets`;
    let labelSets: string[][];
    if (labelsInAll.length > 0) {
      description += ', but all including';
      labelSets = [labelsInAll];
    } else {
      labelSets = [];
    }

    return { description, labelSets };
  }

  focusDelayed(focusable: { focus: () => void }) {
    setTimeout(() => focusable.focus(), 0);
  }

  onSubmit() {
    if (this.editMode === 'add' && this.rule.triggers.length === 0
      && !confirm('You have not selected any triggers. This rule will never be executed.\n\nAre you sure?')) {
      return;
    }
    this.matDialogRef.close(true);
  }

}
