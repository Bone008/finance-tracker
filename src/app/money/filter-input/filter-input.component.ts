import { Component, Input, OnInit } from '@angular/core';
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
  set filterInput(value: string) { this.state.setValue(value); }

  constructor() { }

  ngOnInit() {
    if (!this.state) {
      this.state = new FilterState();
    }
  }

  clearFilter() {
    this.state.setValueNow("");
  }
}
