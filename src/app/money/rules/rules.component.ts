import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { cloneMessage, timestampNow } from 'src/app/core/proto-util';
import { ProcessingRule, ProcessingTrigger } from '../../../proto/model';
import { DataService } from '../data.service';
import { DialogService } from '../dialog.service';
import { SettableField } from '../rule.service';

@Component({
  selector: 'app-rules',
  templateUrl: './rules.component.html',
  styleUrls: ['./rules.component.css']
})
export class RulesComponent implements OnInit {
  readonly TRIGGER_ADDED = ProcessingTrigger.ADDED;
  readonly TRIGGER_IMPORTED = ProcessingTrigger.IMPORTED;
  readonly TRIGGER_MODIFIED = ProcessingTrigger.MODIFIED;

  rules$: Observable<ProcessingRule[]>;

  constructor(
    private readonly dataService: DataService,
    private readonly dialogService: DialogService,
  ) { }

  ngOnInit() {
    this.rules$ = this.dataService.processingRules$;
  }

  /** Opens dialog to create a new rule. */
  startAdd() {
    const rule = new ProcessingRule();
    this.dialogService.openRuleEdit(rule, 'add')
      .afterConfirmed().subscribe(() => {
        rule.created = timestampNow();
        this.dataService.addProcessingRules(rule);
      });
  }

  /** Opens dialog to edit an existing rule. */
  startEdit(rule: ProcessingRule) {
    const temp = cloneMessage(ProcessingRule, rule);
    this.dialogService.openRuleEdit(temp, 'edit')
      .afterConfirmed().subscribe(() => {
        Object.assign(rule, temp);
        rule.modified = timestampNow();
      });
  }

  delete(rule: ProcessingRule) {
    this.dataService.removeProcessingRules(rule);
  }

  drop(currentRules: ProcessingRule[], event: CdkDragDrop<ProcessingRule[]>) {
    moveItemInArray(currentRules, event.previousIndex, event.currentIndex);
  }

  formatFieldName(fieldName: SettableField): string {
    if (fieldName === 'whoIdentifier') {
      return 'iban';
    }
    return fieldName;
  }

}
