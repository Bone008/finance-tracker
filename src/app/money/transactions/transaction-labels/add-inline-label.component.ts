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
  newlyCreatedLabelSuggestion$: Observable<string | null>;

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
          this.refreshAllLabels();
        } else {
          this.confirmAdd();
        }
      });

    this.allLabelsFiltered$ = this.newLabelSubject
      .pipe(map(value => this.filterLabelsByInput(value)));
    this.newlyCreatedLabelSuggestion$ = this.newLabelSubject
      .pipe(map(value => this.getNewlyCreatedLabelSuggestion(value)));
  }

  private refreshAllLabels() {
    this.allLabels = this.dataService.getAllLabels().sort();
  }

  private setIsOpen(value: boolean) {
    this.isOpenSubject.next(value);
  }

  confirmAdd() {
    const cleanLabel = sanitizeLabelName(this.newLabel);
    if (cleanLabel.length > 0) {
      this.addRequested.emit(cleanLabel);
      this.refreshAllLabels();
    }
    this.newLabel = "";
  }

  requestDelete() {
    this.deleteLastRequested.next();
    this.refreshAllLabels();
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
    const cleanInput = sanitizeLabelName(input);

    // Also include descriptions in search, but always sort them after direct matches.
    // This is copied in `TransactionFilterService.suggestFilterContinuations`!
    const allDescriptions = this.allLabels
      .map(label => [label, this.dataService.getLabelConfig(label)?.description])
      .filter(([_, description]) => !!description)
      .map(([label, description]) => label + '-_|_-' + description!.toLowerCase());

    let matches = filterFuzzyOptions(this.allLabels.concat(allDescriptions), cleanInput)
      .map(label => label.split('-_|_-')[0]) // Remove description again.
      .filter((label, index, array) => array.indexOf(label) === index); // Deduplicate labels.

    if (this.excludedLabels) {
      matches = matches.filter(label => !this.excludedLabels!.includes(label));
    }
    return matches;
  }

  private getNewlyCreatedLabelSuggestion(input: string): string | null {
    const cleanInput = sanitizeLabelName(this.newLabel);
    if (cleanInput.length > 0 && !this.allLabels.includes(cleanInput)) {
      return cleanInput;
    }
    return null;
  }

}
