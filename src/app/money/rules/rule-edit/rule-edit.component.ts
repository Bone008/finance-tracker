import { Component, ElementRef, Inject, OnInit, QueryList, ViewChildren } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { pushDeduplicate } from 'src/app/core/util';
import { ProcessingAction, ProcessingRule, ProcessingTrigger } from 'src/proto/model';
import { FilterState } from '../../filter-input/filter-state';

export interface RuleEditConfig {
  rule: ProcessingRule;
  editMode: 'add' | 'edit';
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

  @ViewChildren('app-label', { read: ElementRef })
  addChipElements: QueryList<ElementRef>;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: RuleEditConfig,
    private readonly matDialogRef: MatDialogRef<RuleEditComponent>,
  ) {
    this.rule = data.rule;
    this.editMode = data.editMode;

    this.filterState.setValueNow(this.rule.filter);
    this.filterState.value$.subscribe(value => this.rule.filter = value.trim());
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

  focusDelayed(focusable: { focus: () => void }) {
    setTimeout(() => focusable.focus(), 0);
  }

  onSubmit() {
    this.matDialogRef.close(true);
  }

}
