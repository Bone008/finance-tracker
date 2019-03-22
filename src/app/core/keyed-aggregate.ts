class KeyedGenericAggregate<TAggregate, TValue = TAggregate> {
  private data: { [key: string]: TAggregate } = {};

  get length(): number {
    return Object.getOwnPropertyNames(this.data).length;
  }

  constructor(
    private readonly seeder: () => TAggregate,
    private readonly aggregator: (current: TAggregate, next: TValue) => TAggregate) { }

  reset() {
    this.data = {};
  }

  add(key: string, value: TValue) {
    if (this.data.hasOwnProperty(key)) {
      this.data[key] = this.aggregator(this.data[key], value);
    } else {
      const initialValue = this.seeder();
      this.data[key] = this.aggregator(initialValue, value);
    }
  }

  addMany(key: string, values: Iterable<TValue> | ArrayLike<TValue>) {
    if (!this.data.hasOwnProperty(key)) {
      this.data[key] = this.seeder();
    }
    let intermediate = this.data[key];
    for (const value of Array.from(values)) {
      intermediate = this.aggregator(intermediate, value);
    }
    this.data[key] = intermediate;
  }

  delete(key: string) {
    delete this.data[key];
  }

  get(key: string): TAggregate | null {
    if (this.data.hasOwnProperty(key)) {
      return this.data[key];
    } else {
      return null;
    }
  }

  /** Returns all keys in arbitrary order. */
  getKeys(): string[] {
    return Object.getOwnPropertyNames(this.data);
  }

  /** Returns a list of values ordered the same as getKeys(). */
  getValues(): TAggregate[] {
    return this.getKeys().map(key => this.data[key]);
  }

  /** Returns all entries as tuples in arbitrary order. */
  getEntries(): [string, TAggregate][] {
    return this.getKeys().map(key => <[string, TAggregate]>[key, this.data[key]]);
  }

  /** Returns all entries as tuples, sorted by their keys. */
  getEntriesSorted(compareFn?: (a: string, b: string) => number): [string, TAggregate][] {
    return this.getKeys()
      .sort(compareFn)
      .map(key => <[string, TAggregate]>[key, this.data[key]]);
  }

  getObject(): { [key: string]: TAggregate } {
    return this.data;
  }
}

export class KeyedNumberAggregate extends KeyedGenericAggregate<number> {
  constructor() {
    super(() => 0, (current, next) => current + next);
  }

  /** Returns a new KeyedNumberAggregate that contains only entries accepted by the given filter. */
  filter(predicate: (key: string, value: number) => boolean): KeyedNumberAggregate {
    const newAggregate = new KeyedNumberAggregate();
    for (const [key, value] of this.getEntries()) {
      if (predicate(key, value)) {
        newAggregate.add(key, value);
      }
    }
    return newAggregate;
  }
}

export class KeyedArrayAggregate<T> extends KeyedGenericAggregate<T[], T> {
  constructor() {
    super(() => [], (current, next) => { current.push(next); return current; });
  }

  *getValuesFlat(): Iterable<T> {
    for (const value of this.getValues()) {
      for (const scalar of value) {
        yield scalar;
      }
    }
  }
}

export class KeyedSetAggregate<T> extends KeyedGenericAggregate<Set<T>, T> {
  constructor() {
    super(() => new Set<T>(), (current, next) => { current.add(next); return current; });
  }
}
