import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { debounceTime, map } from 'rxjs/operators';
import { DataService } from '../data.service';

@Component({
  selector: 'app-add-inline-label',
  templateUrl: './add-inline-label.component.html',
  styleUrls: ['./add-inline-label.component.css']
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

  constructor(private readonly dataService: DataService) {
  }

  ngOnInit() {
    this.isOpenSubject
      .pipe(debounceTime(50))
      .subscribe(value => {
        this.isOpen = value;
        // Update set of available labels whenever the control is opened,
        // because it can change long after ngOnInit.
        this.allLabels = this.dataService.getAllLabels().sort();
      });

    this.allLabelsFiltered$ = this.newLabelSubject
      .pipe(map(value => this.filterLabelsByInput(value)));
  }

  setIsOpen(value: boolean) {
    this.isOpenSubject.next(value);
  }

  confirmAdd() {
    const cleanLabel = this.newLabel.trim().toLowerCase();
    if (cleanLabel.length > 0) {
      this.addRequested.emit(cleanLabel);
    }
    this.newLabel = "";
  }

  requestDelete() {
    this.deleteLastRequested.next();
  }

  private filterLabelsByInput(input: string): string[] {
    const cleanInput = this.newLabel.trim().toLowerCase();
    if (input) {
      const matches = this.allLabels.filter(label =>
        label.includes(cleanInput)
        && (!this.excludedLabels || this.excludedLabels.indexOf(label) === -1)
      );

      // Partition the results into two groups: Matches actually starting with
      // the input vs ones just matching somewhere else. Always sort stronger
      // matches before weaker ones.
      const [strongMatches, weakMatches] = matches.reduce((result, label) => {
        const isStrong = label.startsWith(cleanInput);
        result[isStrong ? 0 : 1].push(label);
        return result;
      }, [<string[]>[], <string[]>[]]);

      return [...strongMatches, ...weakMatches];
    } else {
      return [];
    }
  }

}
