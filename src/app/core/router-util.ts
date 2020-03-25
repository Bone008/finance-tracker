import { ActivatedRoute, Router } from "@angular/router";
import { Observable, Subject } from "rxjs";
import { filter, map, tap } from "rxjs/operators";

/** Globally remembers the last known fragment. */
let lastRawFragment = '';

/**
 * Sets up a one-directional link that ensures that the URL fragment follows the value of the given observer.
 * Additionally returns an observable that is updated with any external changes to the fragment value.
 */
export function observeFragment(paramName: string, observable: Observable<string>, route: ActivatedRoute, router: Router): Observable<string> {
  let lastObservedValue = '';

  // Value change --> fragment change.
  observable.subscribe(value => {
    const newValue = value.trim();
    lastObservedValue = newValue;

    const params = parseFragment(lastRawFragment);
    if (newValue === (params.get(paramName) || '')) {
      return;
    }
    if (newValue) {
      params.set(paramName, newValue);
    } else { params.delete(paramName); }
    const newFragment = serializeFragment(params);
    // Immediately update global fragment, so the value is available even if
    // another fragment param is updated before router navigation has finished.
    lastRawFragment = newFragment;

    console.log(paramName, ':: value --> fragment:', `"${newFragment}"`);
    if (newFragment) {
      router.navigate([], { fragment: newFragment, queryParamsHandling: 'preserve' });
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

  // Fragment change --> value change.
  return route.fragment.pipe(
    tap(fragment => { lastRawFragment = fragment; }),
    map(fragment => parseFragment(fragment).get(paramName) || ''),
    // Ignore updates to fragment that we caused internally.
    filter(newValue => newValue !== lastObservedValue),
    tap(newValue => console.log(paramName, ':: fragment --> value:', `"${newValue}"`))
  );
}

/** Sets up a bidirectional link between a subject's value and a URL fragment parameter. */
export function followFragment(paramName: string, subject: Subject<string>, route: ActivatedRoute, router: Router) {
  const fragmentValue$ = observeFragment(paramName, subject, route, router);
  fragmentValue$.subscribe(subject);
}

const ENCODED_PCT = '%25';
const ENCODED_AND = '%26';

function parseFragment(input: string | null): Map<string, string> {
  // Use Map class since it retains insertion order.
  const map = new Map<string, string>();
  if (!input) return map;
  for (const param of input.split('&')) {
    const i = param.indexOf('=');
    if (i < 1) continue;
    const key = param.substr(0, i);
    const value = param.substr(i + 1);
    map.set(key, value.replace(ENCODED_AND, '&').replace(ENCODED_PCT, '%'));
  }
  return map;
}

function serializeFragment(paramsMap: Map<string, string>): string {
  return Array.from(paramsMap.entries())
    .map(([key, value]) => key + '=' + value.replace('%', ENCODED_PCT).replace('&', ENCODED_AND))
    .join('&');
}
