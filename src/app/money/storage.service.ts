import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { gzip, ungzip } from "pako";
import { Observable, of, throwError } from "rxjs";
import { catchError, map } from "rxjs/operators";
import { DataContainer, Transaction, TransactionData } from "../../proto/model";
import { LoggerService } from "../core/logger.service";
import { dateToTimestamp, numberToMoney, timestampNow } from "../core/proto-util";
import { delay } from "../core/util";

const STORAGE_KEY = "money_data_container";
// For now a fixed value.
const BLOB_ID = "0000-cafe-42ba";

interface ApiResponse {
  error?: string;
  code?: number;
  stackTrace?: number;
}

interface SaveStorageResponse extends ApiResponse {
  success?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  constructor(
    private readonly httpClient: HttpClient,
    private readonly loggerService: LoggerService
  ) {
  }

  private logHttpErrors(error: HttpErrorResponse, friendlyError: string): Observable<never> {
    if (error.error instanceof ErrorEvent) {
      // A client-side or network error occurred.
      this.loggerService.error("A network error occurred:", error.error.message);
    } else {
      // The backend returned an unsuccessful response code.
      this.loggerService.error(`Server returned error code ${error.status}.`, error.error);
    }

    return throwError(friendlyError);
  }

  /**
   * Attempts to load data from the storage backend.
   * Returns null if no data was saved yet.
   */
  loadData(): Promise<DataContainer | null> {
    return this.httpClient.get(
      '/api/storage/' + BLOB_ID,
      { responseType: 'arraybuffer' }
    )
      .pipe(catchError((error: HttpErrorResponse) => {
        if (error.status === 404) return of(null);
        else return throwError(error);
      }))
      .pipe(catchError(e => this.logHttpErrors(e, "Error loading data!")))
      .pipe(map(responseData => {
        // Pass through not found.
        if (responseData === null) return null;

        // Decompress & decode if we have a response.
        let uncompressedData: Uint8Array;
        try {
          uncompressedData = ungzip(new Uint8Array(responseData));
        } catch (e) {
          this.loggerService.error("Failed to decompress:", e);
          // Attempt to decode without decompressing, the data may have been
          // saved without compression.
          uncompressedData = new Uint8Array(responseData);
        }

        try {
          return DataContainer.decode(uncompressedData);
        } catch (e) {
          this.loggerService.error("Failed to decode:", e);
          throw "Error decoding loaded data!";
        }
      }))
      .toPromise();
  }

  loadDataLegacy(): Promise<DataContainer | null> {
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

    const encodedData = DataContainer.encode(data).finish();
    const compressedData = gzip(encodedData);

    // The slicing is necessary because the ArrayBuffer that is underlying
    // the Uint8Array may have a larger size than the actual data, which messes
    // up the Content-Length header sent in the request, so the saved file
    // on the server may contain bogus data.
    const compactBuffer = compressedData.buffer.slice(0, compressedData.byteLength);

    return this.httpClient.post<SaveStorageResponse>(
      '/api/storage/' + BLOB_ID,
      compactBuffer,
      {
        'headers': {
          'Content-Type': 'application/octet-stream',
        }
      }
    )
      .pipe(catchError(e => this.logHttpErrors(e, "Saving failed!")))
      .pipe(map(response => {
        if (!response.success) {
          this.loggerService.error("Server error while saving:", response.error);
          if (response.stackTrace) {
            this.loggerService.error("Server stack trace:\n" + response.stackTrace);
          }
          throw response.error;
        }
      })).toPromise();
  }

  saveDataLegacy(data: DataContainer): Promise<void> {
    const error = DataContainer.verify(data);
    if (error) return Promise.reject(error);

    try {
      const dataArray = DataContainer.encodeDelimited(data).finish();
      const stringified = this.binaryToString(dataArray);
      localStorage.setItem(STORAGE_KEY, stringified);
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
