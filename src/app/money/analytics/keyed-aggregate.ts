export class KeyedAggregate {
  private data: { [key: string]: number } = {};

  get length(): number {
    return Object.getOwnPropertyNames(this.data).length;
  }

  reset() {
    this.data = {};
  }

  /** Returns a new KeyedAggregate that contains only entries accepted by the given filter. */
  filter(predicate: (key: string, value: number) => boolean): KeyedAggregate {
    const newAggregate = new KeyedAggregate();
    for (const key of this.getKeys()) {
      if (predicate(key, this.data[key])) {
        newAggregate.add(key, this.data[key]);
      }
    }
    return newAggregate;
  }

  add(key: string, value: number) {
    if (this.data.hasOwnProperty(key)) {
      this.data[key] += value;
    } else {
      this.data[key] = value;
    }
  }

  delete(key: string) {
    delete this.data[key];
  }

  get(key: string): number | null {
    if (this.data.hasOwnProperty(key)) {
      return this.data[key];
    } else {
      return null;
    }
  }

  getKeys(): string[] {
    return Object.getOwnPropertyNames(this.data);
  }

  /** Returns a list of values ordered the same as getKeys(). */
  getValues(): number[] {
    return this.getKeys().map(key => this.data[key]);
  }

  getEntries(): [string, number][] {
    return this.getKeys().map(key => <[string, number]>[key, this.data[key]]);
  }

  getObject(): { [key: string]: number } {
    return this.data;
  }
}