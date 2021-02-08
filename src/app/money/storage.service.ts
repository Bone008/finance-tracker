import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { gzip, ungzip } from "pako";
import { Observable, of, throwError } from "rxjs";
import { catchError, map, mergeMap, switchMap } from "rxjs/operators";
import { DataContainer } from "../../proto/model";
import { createEncryptionKey, createKnownEncryptionKey, decryptWithKey, encryptWithKey, getPasswordInfoFromPayload, isCryptoPayload, PasswordMetadata } from "../core/crypto-util";
import { LoggerService } from "../core/logger.service";
import { timestampNow } from "../core/proto-util";
import { StorageSettings, StorageSettingsService } from "./storage-settings.service";

const LEGACY_STORAGE_KEY = "money_data_container";

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
  private lastLoadSuccessful = true;
  private lastKnownHash: string | null = null;
  private lastPasswordInfo: PasswordMetadata | null = null;

  constructor(
    private readonly storageSettingsService: StorageSettingsService,
    private readonly httpClient: HttpClient,
    private readonly loggerService: LoggerService
  ) {
  }

  getLastLoadSuccessful(): boolean {
    return this.lastLoadSuccessful;
  }

  /**
   * Attempts to turn password into a usable key:
   * - If dataKey is null or new, generates metadata and remembers it for the next save.
   * - If dataKey is found to be an existing encrypted databases, extracts metadata
   *   from it and validates that the password matches.
   */
  async convertToEncryptionKey(dataKey: string | null, password: string): Promise<CryptoKey> {
    let responseData: ArrayBuffer | null = null;

    if (dataKey) {
      responseData = await this.sendLoadData(dataKey).toPromise()
        .catch(() => null);
    }

    if (responseData === null || !isCryptoPayload(responseData)) {
      // No stored cryptotext yet, so we are free to generate a fresh key.
      this.loggerService.log('Creating new encryption key.');
      const info = await createEncryptionKey(password);
      this.lastPasswordInfo = info.meta;
      return info.key;
    }
    else {
      // Use metadata for key derivation from crypto payload.
      this.loggerService.log('Deriving encryption key from stored metadata.');
      const meta = getPasswordInfoFromPayload(responseData);
      const key = await createKnownEncryptionKey(password, meta);

      // Attempt decryption to check if the password matches.
      await decryptWithKey(responseData, key);
      this.lastPasswordInfo = meta;
      return key;
    }
  }

  private logAndRethrowAs(error: HttpErrorResponse, friendlyError: string): Observable<never> {
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
   * Attempts to determine if our local view of the data is out of date.
   */
  async checkIsDataStale(): Promise<boolean> {
    if (!this.storageSettingsService.hasSettings() || !this.lastKnownHash) {
      return Promise.resolve(false);
    }
    const settings = await this.storageSettingsService.getSettings();
    return this.sendLoadData(settings!.dataKey)
      .pipe(
        switchMap(responseData => responseData ? calculateHash(responseData) : of(null)),
        map(hash => hash !== null && hash !== this.lastKnownHash)
      )
      .toPromise();
  }

  /**
   * Attempts to load data from the storage backend.
   * Returns null if no data was saved yet.
   */
  loadData(): Promise<DataContainer | null> {
    const result = this.doLoadData();
    result.then(() => this.lastLoadSuccessful = true, () => this.lastLoadSuccessful = false);
    return result;
  }
  private async doLoadData(): Promise<DataContainer | null> {
    const storageSettings = await this.storageSettingsService.getSettings();
    if (!storageSettings) {
      // We don't have a data key yet, return empty container and leave it unset.
      // Automatically generating one here would lead to the user not noticing
      // when localStorage was cleared while the app remains loaded and silently
      // storing their existing database under a new key.
      return null;
    }

    const responseData = await this.sendLoadData(storageSettings.dataKey).toPromise();
    // Pass through not found.
    if (responseData === null) {
      return Promise.resolve(null);
    }

    // Decrypt (if we received a cryptotext).
    let decryptedData: ArrayBuffer;
    if (isCryptoPayload(responseData)) {
      if (!storageSettings.encryptionKey) {
        return Promise.reject("Error: Data is encrypted!");
      }
      try {
        decryptedData = await decryptWithKey(responseData, storageSettings.encryptionKey);
      } catch (e) {
        return Promise.reject("Error: Data could not be decrypted! Did the password change?");
      }
      this.lastPasswordInfo = getPasswordInfoFromPayload(responseData);
    } else {
      decryptedData = responseData;
    }

    // Decompress & decode if we have a response.
    let uncompressedData: Uint8Array;
    try {
      uncompressedData = ungzip(new Uint8Array(decryptedData));
    } catch (e) {
      this.loggerService.error("Failed to decompress:", e);
      // Attempt to decode without decompressing, the data may have been
      // saved without compression.
      uncompressedData = new Uint8Array(decryptedData);
    }

    try {
      const data = DataContainer.decode(uncompressedData);

      // Upon success, calculate response hash and remember it.
      this.lastKnownHash = await calculateHash(responseData);
      return data;
    } catch (e) {
      this.loggerService.error("Failed to decode:", e);
      return Promise.reject("Error decoding loaded data!");
    }
  }

  /** Sends the GET request for data and handles HTTP errors. */
  private sendLoadData(dataKey: string): Observable<ArrayBuffer | null> {
    return this.httpClient.get('/api/storage/' + dataKey, { responseType: 'arraybuffer' })
      .pipe(catchError((error: HttpErrorResponse) => {
        if (error.status === 404) return of(null);
        else return throwError(error);
      }))
      .pipe(catchError(e => this.logAndRethrowAs(e, "Error loading data!")));
  }

  async saveData(data: DataContainer, overrideSettings?: StorageSettings): Promise<void> {
    const settings = overrideSettings || await this.storageSettingsService.getSettings();
    if (!settings) {
      return Promise.reject("No data key! Please set one in settings.");
    }

    data.lastModified = timestampNow();
    const compressedData = this.encodeAndCompressData(data);

    let finalData: ArrayBuffer;
    if (settings.encryptionKey) {
      if (!this.lastPasswordInfo) {
        return Promise.reject('Password settings not available for encryption!');
      }
      finalData = await encryptWithKey(compressedData, settings.encryptionKey, this.lastPasswordInfo);
    } else {
      // Do not encrypt.
      if (!confirm('Warning: No encryption password is set. Your data will sent to the server without encryption! Continue?')) {
        return Promise.reject('Please set encryption password in settings!');
      }
      finalData = compressedData;
    }

    const dataBlob = new Blob([finalData], { type: 'application/octet-stream' });
    const formData = new FormData();
    formData.set('data', dataBlob, settings.dataKey);
    if (this.lastKnownHash !== null) {
      formData.set('lastKnownHash', this.lastKnownHash);
    }

    return this.httpClient.post<SaveStorageResponse>('/api/storage/' + settings.dataKey, formData)
      .pipe(catchError(e => this.logAndRethrowAs(e, "Saving failed!")))
      .pipe(mergeMap(response => {
        if (!response.success) {
          this.loggerService.error("Server error while saving:", response.error);
          if (response.stackTrace) {
            this.loggerService.error("Server stack trace:\n" + response.stackTrace);
          }
          return Promise.reject(response.error);
        }

        // On success, update stored hash.
        return calculateHash(finalData).then(hash => {
          this.lastKnownHash = hash;
        });
      })).toPromise();
  }

  /** Returns the optimized binary representation of the given DataContainer. */
  encodeAndCompressData(data: DataContainer): Uint8Array {
    const encodedData = DataContainer.encode(data).finish();
    return gzip(encodedData);
  }

  // Old methods for storing and loading from localStorage.
  // Code is kept around for when we add local caching for faster loads & offline mode.
  // #region 

  // private loadDataLegacy(): Promise<DataContainer | null> {
  //   return delay(100).then(() => {
  //     const timeStart = performance.now();
  //     const stringified = localStorage.getItem(LEGACY_STORAGE_KEY);
  //     if (!stringified) {
  //       return null;
  //     }
  //     const dataArray = this.stringToBinary(stringified);
  //     const data = DataContainer.decodeDelimited(dataArray);
  //     const timeEnd = performance.now();
  //     console.log(`Loaded data from storage (packed: ${dataArray.length.toLocaleString()} B) in ${timeEnd - timeStart} ms.`);
  //     return data;
  //   });
  // }

  // private saveDataLegacy(data: DataContainer): Promise<void> {
  //   const error = DataContainer.verify(data);
  //   if (error) return Promise.reject(error);
  //   try {
  //     const dataArray = DataContainer.encodeDelimited(data).finish();
  //     const stringified = this.binaryToString(dataArray);
  //     localStorage.setItem(LEGACY_STORAGE_KEY, stringified);
  //     return Promise.resolve();
  //   } catch (e) {
  //     return Promise.reject(e);
  //   }
  // }

  // private deleteDataLegacy(): Promise<void> {
  //   localStorage.removeItem(LEGACY_STORAGE_KEY);
  //   return Promise.resolve();
  // }
  // #endregion

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

/** Calculates hash of a binary array and returns it as a hex string. */
function calculateHash(buffer: Int8Array | Int16Array | Int32Array | Uint8Array | Uint16Array | Uint32Array | Uint8ClampedArray | Float32Array | Float64Array | DataView | ArrayBuffer): PromiseLike<string> {
  return crypto.subtle.digest('SHA-256', buffer).then(binaryToHex);
}

function binaryToHex(buffer: ArrayBuffer): string {
  const byteArray = new Uint8Array(buffer);
  const hexCodes = [...byteArray].map(value => value.toString(16).padStart(2, '0'));
  return hexCodes.join('');
}
