import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { ErrorStateMatcher, MatAutocompleteTrigger, ShowOnDirtyErrorStateMatcher } from '@angular/material';
import { Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { TransactionFilterService } from '../transaction-filter.service';
import { FilterState } from './filter-state';

@Component({
  selector: 'app-filter-input',
  templateUrl: './filter-input.component.html',
  styleUrls: ['./filter-input.component.css'],
  providers: [
    { provide: ErrorStateMatcher, useClass: ShowOnDirtyErrorStateMatcher },
  ],
})
export class FilterInputComponent implements OnInit {
  @Input()
  state: FilterState;

  @ViewChild(MatAutocompleteTrigger)
  private filterAutocompleteTrigger: MatAutocompleteTrigger;

  get filterInput() { return this.state.getCurrentValue(); }
  set filterInput(value: string) { this.state.setValue(value); this.inputLiveChangeSubject.next(value); }

  filterSuggestions$: Observable<string[]>;
  private inputLiveChangeSubject = new Subject<string>();

  constructor(private readonly filterSerivice: TransactionFilterService) { }

  ngOnInit() {
    if (!this.state) {
      this.state = new FilterState();
    }

    this.filterSuggestions$ = this.inputLiveChangeSubject.pipe(
      map(value => this.filterSerivice.suggestFilterContinuations(value))
    );
  }

  clearFilter() {
    this.state.setValueNow("");
  }

  reopenPanel() {
    // Used to keep the autocomplete window open after selecting
    // an intermediate completion (e.g. "label:").
    setTimeout(() => this.filterAutocompleteTrigger.openPanel(), 50);
  }
}
