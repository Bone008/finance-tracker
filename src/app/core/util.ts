
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
