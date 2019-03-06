import { merge, Observable, Subject } from "rxjs";
import { debounceTime, distinctUntilChanged, map, startWith } from "rxjs/operators";

/** Time in ms to wait after input before applying the filter. */
const FILTER_DEBOUNCE_TIME = 500;

export class FilterState {
  readonly value$: Observable<string>;

  private _currentValue: string;
  /** Emits events whenever the value softly changes. */
  private readonly softChangeSubject = new Subject<void>();
  /** Emits events whenever the value should be updated PRONTO. */
  private readonly immediateChangeSubject = new Subject<void>();

  constructor(initialValue = "") {
    this._currentValue = initialValue;

    const debouncedSoftChange = this.softChangeSubject.pipe(
      debounceTime(FILTER_DEBOUNCE_TIME));

    this.value$ = merge(debouncedSoftChange, this.immediateChangeSubject).pipe(
      // Make it initially emit an event. Note that this has to be before the
      // map() operation, so new subscribers always receive the current value.
      startWith(void (0)),
      map(() => this._currentValue),
      distinctUntilChanged()
    );
  }

  getCurrentValue(): string {
    return this._currentValue;
  }

  setValue(newValue: string) {
    this._currentValue = newValue;
    this.softChangeSubject.next();
  }

  setValueNow(newValue: string) {
    this._currentValue = newValue;
    this.immediateChangeSubject.next();
  }
}
