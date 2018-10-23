import { Component, Input, OnInit } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';
import { TransactionFilterService } from '../transaction-filter.service';
import { FilterState } from './filter-state';

@Component({
  selector: 'app-filter-input',
  templateUrl: './filter-input.component.html',
  styleUrls: ['./filter-input.component.css']
})
export class FilterInputComponent implements OnInit {
  @Input()
  state: FilterState;

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
}
