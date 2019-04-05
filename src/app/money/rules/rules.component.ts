import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { ProcessingRule, ProcessingTrigger } from '../../../proto/model';
import { DataService } from '../data.service';
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

  constructor(private readonly dataService: DataService) { }

  ngOnInit() {
    this.rules$ = this.dataService.processingRules$;
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
