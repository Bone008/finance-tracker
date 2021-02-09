import { Component, ElementRef, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { debounceTime, map } from 'rxjs/operators';
import { filterFuzzyOptions } from '../../../core/util';
import { DataService } from '../../data.service';
import { sanitizeLabelName } from '../../model-util';

@Component({
  selector: 'app-add-inline-label',
  templateUrl: './add-inline-label.component.html',
  styleUrls: ['./add-inline-label.component.css'],
})
export class AddInlineLabelComponent implements OnInit {
  @Input() excludedLabels: string[] | undefined;

  private _newLabel = "";
  private readonly newLabelSubject = new Subject<string>();

  get newLabel() { return this._newLabel; }
  set newLabel(value: string) {
    this._newLabel = value;
    this.newLabelSubject.next(value);
  }

  allLabels: string[] = [];
  allLabelsFiltered$: Observable<string[]>;

  /**
   * This property is debounced to prevent it from jumping around
   * when switching focus from the input element to the confirm button.
   */
  @Output() isOpen = false;
  @Output() readonly addRequested = new EventEmitter<string>();
  @Output() readonly deleteLastRequested = new EventEmitter<void>();

  private isOpenSubject = new Subject<boolean>();
  private rawHasFocus = false;

  constructor(
    private readonly dataService: DataService,
    private readonly element: ElementRef<HTMLElement>) {
  }

  ngOnInit() {
    this.isOpenSubject
      .pipe(debounceTime(50))
      .subscribe(value => {
        this.isOpen = value;
        if (value) {
          // Update set of available labels whenever the control is opened,
          // because it can change long after ngOnInit.
          this.allLabels = this.dataService.getAllLabels().sort();
        } else {
          this.confirmAdd();
        }
      });

    this.allLabelsFiltered$ = this.newLabelSubject
      .pipe(map(value => this.filterLabelsByInput(value)));
  }

  setIsOpen(value: boolean) {
    this.isOpenSubject.next(value);
  }

  confirmAdd() {
    const cleanLabel = sanitizeLabelName(this.newLabel);
    if (cleanLabel.length > 0) {
      this.addRequested.emit(cleanLabel);
    }
    this.newLabel = "";
  }

  requestDelete() {
    this.deleteLastRequested.next();
  }

  // Necessary to programmatically focus this element from outside a template reference.
  focus() {
    this.element.nativeElement.querySelector('input')!.focus();
  }

  onFocusIn() {
    this.rawHasFocus = true;
    this.setIsOpen(true);;
  }

  onFocusOut(isAutocompleteOpen: boolean) {
    this.rawHasFocus = false;
    if (!isAutocompleteOpen) {
      this.setIsOpen(false);
    }
  }

  onAutocompleteClose() {
    // If we lost focus while autocomplete was open, we have to close now.
    if (!this.rawHasFocus) {
      this.setIsOpen(false);
    }
  }

  private filterLabelsByInput(input: string): string[] {
    const cleanInput = sanitizeLabelName(this.newLabel);
    let matches = filterFuzzyOptions(this.allLabels, cleanInput);
    if (this.excludedLabels) {
      matches = matches.filter(label => this.excludedLabels!.indexOf(label) === -1);
    }
    return matches;
  }

}
