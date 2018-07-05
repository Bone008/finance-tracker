import { Injectable } from "@angular/core";
import { delay } from "../core/util";
import { DataContainer } from "../money/data-container.model";
import { createTransaction, Transaction } from "./transaction.model";

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  // Until a real backend is implemented, use a fake in-memory storage.
  private mockData: DataContainer = {
    lastModified: new Date('2018-05-20 19:34:52'),
    transactions: createDummyTransactions(50),
  };

  loadData(): Promise<DataContainer> {
    return delay(0, this.mockData);
  }

  saveData(data: DataContainer): Promise<void> {
    data.lastModified = new Date();
    this.mockData = data;
    return delay(500);
  }
}


const MOCK_WHOS = ['Mueller GmbH', 'REWE Buxdehude', 'Dönerfritze 2000', 'Worker dude', 'SWEET JESUS AUTOHANDEL', 'Aral GmbH', 'AMAZON EU S.A R.L., NIEDERLASSUNG DEUTSCHLAND', 'PayPal (Europe) S.a.r.l. et Cie., S.C.A.'];
const MOCK_COMMENTS = [
  "pizza place",
  "hans im glück",
  "gift from grandma",
  "not sure lol",
  "only an estimate",
];

export function createDummyTransactions(num: number): Transaction[] {
  const transactions = new Array<Transaction>(num);
  for (let i = 0; i < num; i++) {
    const date = new Date(Date.now() - getRandomInt(0, 120)*(24*60*60*1000));
    const baseAmount = getRandomInt(100, 1000);
    const exponent = getRandomInt(-2, 2);
    const amount = (Math.random() > 0.7 ? 1 : -1) * baseAmount * Math.pow(10, exponent);
    const isCash = Math.random() > 0.8;

    const labels: string[] = [];
    if (getRandomBoolean())
      labels.push(getRandomBoolean() ? 'food/groceries' : 'food/supermarket');
    if (getRandomBoolean())
      labels.push('travel');
    if (getRandomBoolean())
      labels.push('car/fuel');
    if (getRandomInt(0, 3) === 0)
      labels.push('accommodation');
    if (amount > 0 && getRandomBoolean())
      labels.push(getRandomBoolean() ? 'scholarship' : 'salary');

    const comment = getRandomBoolean() ? undefined : getRandomElement(MOCK_COMMENTS);

    transactions[i] = createTransaction(date, amount, getRandomElement(MOCK_WHOS), isCash, labels, comment);
  }

   transactions.sort((a, b) => b.date.getTime() - a.date.getTime());
   return transactions;
}

function getRandomElement<T>(arr: T[]): T {
  return arr[getRandomInt(0, arr.length)];
}

/** Returns a random integer between min (inclusive) and max (exclusive). */
function getRandomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min));
}

function getRandomBoolean(): boolean {
  return Math.random() < 0.5;
}