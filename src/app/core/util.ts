
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
