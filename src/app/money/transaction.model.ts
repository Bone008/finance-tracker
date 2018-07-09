import { isArray } from "util";

export interface TransactionBase {
  readonly labels: string[];
  readonly comment: string;

  readonly amount: number;

  isSingle(): this is Transaction;
  isGroup(): this is TransactionGroup;
}

export class TransactionGroup implements TransactionBase {
  readonly labels: string[] = [];
  comment = "";

  children: ChildTransaction[] = [];

  get amount() {
    return this.children
      .map(child => child.amount)
      .reduce((a, b) => a + b, 0);
  }

  isSingle() { return false; }
  isGroup() { return true; }
}

export class ChildTransaction {
  amount: number;
  // TODO: add rest of properties
}

/** Data model of a single recorded transaction. */
export class Transaction implements TransactionBase {
  date = new Date(0);
  amount = 0;
  who = "";
  whoSecondary = "";

  isCash = false;

  labels: string[] = [];
  reasonForTransfer = "";
  bookingText = "";
  comment = "";

  // TODO: somehow unify this for groups too.
  addLabel(label: string): boolean {
    if (this.labels.indexOf(label) === -1) {
      this.labels.push(label);
      return true;
    }
    return false;
  }

  removeLabel(label: string): boolean {
    const index = this.labels.indexOf(label);
    if (index === -1) {
      this.labels.splice(index, 1);
      return true;
    }
    return false;
  }

  isSingle() { return true; }
  isGroup() { return false; }
}
