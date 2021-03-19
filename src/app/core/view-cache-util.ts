export interface CacheCountable {
  /** The counter used for invalidating derived cached values. */
  __c: number | undefined;
}

const TRACKER_NO_OBJECT = -2;
const TRACKER_UNINITIALIZED = -1;

/** Increments the cache counter of a CacheCountable object (if non-null). */
export function invalidateCacheCounter(obj: object | null | undefined) {
  if (obj) {
    (<CacheCountable>obj).__c = ((<CacheCountable>obj).__c || 0) + 1;
  }
}

/**  */
export class CacheCountChecker {
  private lastValue: number | undefined = TRACKER_UNINITIALIZED;

  constructor(private readonly changeCallback?: () => void) { }

  check(obj: CacheCountable | null | undefined, optChangeCallback?: () => void) {
    const currentValue = obj ? obj.__c : TRACKER_NO_OBJECT;
    if (currentValue !== this.lastValue) {
      this.lastValue = currentValue;

      if (this.changeCallback) this.changeCallback();
      if (optChangeCallback) optChangeCallback();
    }
  }
}