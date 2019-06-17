
/** Coerces a data-bound value (typically a string) to a boolean. */
// Inspired by https://github.com/angular/material2/blob/master/src/cdk/coercion/boolean-property.ts
export function coerceBooleanProperty(value: any): boolean {
  return value != null && `${value}` !== 'false';
}

/**
 * Adds `element` to the end of `array` if it is not yet contained.
 * @returns true if the element was added.
 */
export function pushDeduplicate<T>(array: T[], element: T): boolean {
  if (array.includes(element)) return false;
  array.push(element);
  return true;
}

/**
 * Removes first occurrence of `element` from `array` if it is contained.
 * @returns true if the element was removed, false if it wasn't contained
 */
export function removeByValue<T>(array: T[], element: T): boolean {
  const index = array.indexOf(element);
  if (index !== -1) {
    array.splice(index, 1);
    return true;
  }
  return false;
}

/** Wraps a function so its return value is always a single instance to comply with Angular's change detection. */
export function makeShared<TReturn, TShared = TReturn>(
  shared: TShared,
  merge: (shared: TShared, newValue: TReturn) => TReturn,
  fn: () => TReturn
): (() => TReturn) {
  return () => {
    return merge(shared, fn());
  };
}

export function makeSharedDate(fn: () => Date): () => Date;
export function makeSharedDate(fn: () => Date | null): () => Date | null;
export function makeSharedDate(fn: () => Date | null): () => Date | null {
  return makeShared(new Date(), (shared, newValue) => {
    if (newValue === null) return null;
    shared.setTime(newValue.getTime());
    return shared;
  }, fn);
}

export function makeSharedObject<TObject>(fn: () => TObject): () => TObject;
export function makeSharedObject<TObject>(fn: () => TObject | null): () => TObject | null;
export function makeSharedObject<TObject>(fn: () => TObject | null): () => TObject | null {
  return makeShared<TObject | null, {}>({}, (shared, newValue) => {
    if (newValue === null) return null;
    patchObject(shared, newValue);
    return <TObject>shared;
  }, fn);
}


/** Makes sure obj contains the same values as newObj without changing its identity. */
export function patchObject(obj: any, newObj: any) {
  // Special case for arrays: also patch length
  if (Array.isArray(obj) && Array.isArray(newObj)) {
    obj.length = newObj.length;
  }

  for (const key of Object.getOwnPropertyNames(newObj)) {
    // Deep copy objects.
    if (typeof obj[key] === 'object' && typeof newObj[key] === 'object'
      && newObj[key] !== null) {
      patchObject(obj[key], newObj[key]);
    } else {
      obj[key] = newObj[key];
    }
  }
  // Remove properties no longer present in newData.
  for (const key of Object.getOwnPropertyNames(obj)) {
    // Keep chart.js metadata (_meta) untouched.
    if (!(key in newObj) && key.indexOf('_') !== 0) {
      delete obj[key];
    }
  }
}

/** Escapes a string so it is safe to use as a literal in a regular expression. */
export function escapeRegex(input: string): string {
  // Source: https://stackoverflow.com/a/3561711
  return input.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

export function splitQuotedString(input: string): string[] {
  // TODO detect unterminated quotes

  // Adapted from: https://stackoverflow.com/a/18647776
  // The g flag turns on the mode where each call to exec
  // will search starting from the last result.
  const regex = /[^\s"]+|"([^"]*)"/g;
  const tokens: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = regex.exec(input)) !== null) {
    tokens.push(match[1] !== undefined ? match[1] : match[0]);
  }
  return tokens;
}

/**
 * Filters the set of options by the given input string and returns all options
 * that somehow match the input. Case sensitive!
 * If the options should be alphabetically sorted, they already need to be so.
 */
export function filterFuzzyOptions(options: string[], input: string, allowEmptyInput?: boolean): string[] {
  if (input) {
    const matches = options.filter(option => option.includes(input));

    // Partition the results into two groups: Matches actually starting with
    // the input vs ones just matching somewhere else. Always sort stronger
    // matches before weaker ones.
    const [strongMatches, weakMatches] = matches.reduce((result, option) => {
      const isStrong = option.startsWith(input);
      result[isStrong ? 0 : 1].push(option);
      return result;
    }, [<string[]>[], <string[]>[]]);

    return [...strongMatches, ...weakMatches];
  } else {
    return allowEmptyInput ? options.slice(0) : [];
  }
}

/** Adapter between setTimeout and Promises. */
export function delay<T = void>(delay: number, value?: T): Promise<T> {
  return new Promise(resolve => {
    setTimeout(() => resolve(value), delay);
  });
}

export function pluralizeArgument<T>(arg: T | T[]): T[] {
  if (arg instanceof Array) {
    return arg;
  } else {
    return [arg];
  }
}

/** Grammar is hard. */
export function pluralize(amount: number, thing: string, things?: string): string {
  if (amount === 1) {
    return amount + ' ' + thing;
  } else {
    return amount + ' ' + (things || (thing + 's'));
  }
}

export function getRandomElement<T>(arr: T[]): T {
  return arr[getRandomInt(0, arr.length)];
}

/** Returns a random integer between min (inclusive) and max (exclusive). */
export function getRandomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min));
}

export function getRandomBoolean(): boolean {
  return Math.random() < 0.5;
}

/**
 * Returns the maximum of a collection by comparing some numeric key.
 * Returns null if the collection is empty.
 */
export function maxBy<T>(objects: T[], keySelector: (object: T) => number): T | null {
  let current: T | null = null;
  let currentKey = -Infinity;
  for (const obj of objects) {
    const key = keySelector(obj);
    if (key > currentKey) {
      current = obj;
      currentKey = key;
    }
  }
  return current;
}

/**
 * Returns the minimum of a collection by comparing some numeric key.
 * Returns null if the collection is empty.
 */
export function minBy<T>(objects: T[], keySelector: (object: T) => number): T | null {
  let current: T | null = null;
  let currentKey = -Infinity;
  for (const obj of objects) {
    const key = keySelector(obj);
    if (key < currentKey) {
      current = obj;
      currentKey = key;
    }
  }
  return current;
}


/**
 * Returns the maximum of a collection using the provided comparator function.
 * Returns null if the collection is empty.
 */
export function maxByComparator<T>(objects: T[], comparator: (a: T, b: T) => number): T | null {
  let current: T | null = null;
  for (const obj of objects) {
    if (current === null || comparator(obj, current) > 0) {
      current = obj;
    }
  }
  return current;
}

/**
 * Returns the minimum of a collection using the provided comparator function.
 * Returns null if the collection is empty.
 */
export function minByComparator<T>(objects: T[], comparator: (a: T, b: T) => number): T | null {
  let current: T | null = null;
  for (const obj of objects) {
    if (current === null || comparator(obj, current) < 0) {
      current = obj;
    }
  }
  return current;
}
