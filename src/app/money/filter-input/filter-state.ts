import { ActivatedRoute, Router } from "@angular/router";
import { merge, Observable, Subject } from "rxjs";
import { debounceTime, distinctUntilChanged, map, startWith } from "rxjs/operators";

/** Time in ms to wait after input before applying the filter. */
const FILTER_DEBOUNCE_TIME = 500;

export class FilterState {
  /** Observable that emits debounced changes to the filter value. */
  readonly value$: Observable<string>;
  /** Observable that immediately emits any changes to the filter value. */
  readonly immediateValue$: Observable<string>;

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

    this.immediateValue$ = merge(this.softChangeSubject, this.immediateChangeSubject).pipe(
      // Same as above.
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

  followFragment(route: ActivatedRoute, router: Router) {
    const prefix = 'q=';
    let lastFragmentValue = '';

    // Fragment change --> value change.
    route.fragment.subscribe(fragment => {
      const newValue = fragment && fragment.startsWith(prefix)
        ? fragment.substr(prefix.length)
        : '';

      lastFragmentValue = newValue;
      if (newValue === this.getCurrentValue().trim()) {
        return;
      }
      this.setValueNow(newValue);
    });

    // Value change --> fragment change.
    this.value$.subscribe(value => {
      const q = value.trim();
      if (q === lastFragmentValue) {
        return;
      }
      if (q) {
        router.navigate([], { fragment: prefix + q, queryParamsHandling: 'preserve' });
      } else {
        // Workaround for https://github.com/Bone008/finance-tracker/issues/158.
        // The router has a quirk where it calls "replaceState" instead of
        // "pushState" if the new URL contains no hash.
        // Traced to this: https://github.com/angular/angular/blob/c88305d2ebd5c8be3065dc356f7edbe4069d4ef3/packages/common/src/location/location.ts#L112
        // Setting the hash is also not great, as it might retain the '#' as the
        // last character of the URL, but it seems to do its job so far.
        window.location.hash = '';
      }
    });
  }
}
