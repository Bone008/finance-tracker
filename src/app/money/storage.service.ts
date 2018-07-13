import { Injectable } from "@angular/core";
import { DataContainer, Transaction, TransactionData } from "../../proto/model";
import { dateToTimestamp, numberToMoney, timestampNow } from "../core/proto-util";
import { delay } from "../core/util";

const STORAGE_KEY = "money_data_container";

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  constructor() {
    //this.mockData = new DataContainer();
    //this.mockData.lastModified = dateToTimestamp(new Date('2018-05-20 19:34:52'));
    //this.mockData.transactions = createDummyTransactions(50);
  }

  /**
   * Attempts to load data from the storage backend.
   * Returns null if no data was saved yet.
   */
  loadData(): Promise<DataContainer | null> {
    return delay(100).then(() => {
      const timeStart = performance.now();

      const stringified = localStorage.getItem(STORAGE_KEY);
      if (!stringified) {
        return null;
      }

      const dataArray = this.stringToBinary(stringified);
      const data = DataContainer.decodeDelimited(dataArray);

      const timeEnd = performance.now();
      console.log(`Loaded data from storage (packed: ${dataArray.length.toLocaleString()} B) in ${timeEnd - timeStart} ms.`);
      return data;
    });
  }

  saveData(data: DataContainer): Promise<void> {
    data.lastModified = timestampNow();

    const error = DataContainer.verify(data);
    if (error) return Promise.reject(error);

    try {
      const dataArray = DataContainer.encodeDelimited(data).finish();
      const stringified = this.binaryToString(dataArray);
      localStorage.setItem(STORAGE_KEY, stringified);

      const dataArray2 = this.stringToBinary(stringified);
      console.log(dataArray);
      console.log(dataArray2);
      const data2 = DataContainer.decodeDelimited(dataArray2);

      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }

  deleteData(): Promise<void> {
    localStorage.removeItem(STORAGE_KEY);
    return Promise.resolve();
  }

  private binaryToString(bufferView: Uint8Array): string {
    // Note: While encoding each byte to an UTF-16 character
    // takes more memory than necessary, it is simple and works.
    // XmlHttpRequest supports sending Uint8Array directly,
    // we'll use that soon anyway.
    let str = '';
    for (let i = 0; i < bufferView.byteLength; i++) {
      str += String.fromCharCode(bufferView[i]);
    }
    return str;
  }

  private stringToBinary(str: string): Uint8Array {
    const bufferView = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      bufferView[i] = str.charCodeAt(i);
    }
    return bufferView;
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
    const date = new Date(Date.now() - getRandomInt(0, 120) * (24 * 60 * 60 * 1000));
    const baseAmount = getRandomInt(100, 1000);
    const exponent = getRandomInt(-2, 2);
    const amount = (Math.random() > 0.7 ? 1 : -1) * baseAmount * Math.pow(10, exponent);

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

    transactions[i] = new Transaction({
      labels,
      single: new TransactionData({
        date: dateToTimestamp(date),
        amount: numberToMoney(amount),
        who: getRandomElement(MOCK_WHOS),
        isCash: Math.random() > 0.8,
        comment: getRandomBoolean() ? "" : getRandomElement(MOCK_COMMENTS),
      }),
    });
  }

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
