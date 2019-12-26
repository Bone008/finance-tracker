import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { deserializeEncryptionKey, serializeEncryptionKey } from '../core/crypto-util';
import { getRandomInt } from '../core/util';

/** Regular expression that only matches properly formatted data keys. */
export const DATA_KEY_REGEXP = /^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/;
const DATA_KEY_BYTE_LENGTH = 8;

const NAME_DATA_KEY = 'storage_settings_dataKey';
const NAME_ENCRYPTION_KEY = 'storage_settings_encryptionKey';

export interface StorageSettings {
  dataKey: string;
  encryptionKey: CryptoKey | undefined;
}

@Injectable({
  providedIn: 'root'
})
export class StorageSettingsService {
  /** Observable subject that is updated whenever storage settings change. */
  readonly settings$: BehaviorSubject<StorageSettings | null>;

  constructor() {
    this.settings$ = new BehaviorSubject<StorageSettings | null>(null);
    this.getSettings().then(s => this.settings$.next(s));
  }

  hasSettings(): boolean {
    return localStorage.getItem(NAME_DATA_KEY) !== null;
  }

  /**
   * Returns the stored settings as an independent object or null if not found.
   * setSettings() has to be called to persist any changes made to this object.
   **/
  async getSettings(): Promise<StorageSettings | null> {
    const dataKey = localStorage.getItem(NAME_DATA_KEY);
    if (!dataKey) {
      return null;
    }

    const rawEncryptionKey = localStorage.getItem(NAME_ENCRYPTION_KEY);
    if (rawEncryptionKey) {
      try {
        return { dataKey, encryptionKey: await deserializeEncryptionKey(rawEncryptionKey) };
      } catch (e) {
        console.warn('Failed to import stored encryption key:', e);
        return null;
      }
    } else {
      return { dataKey, encryptionKey: undefined };
    }
  }

  /**
   * Returns the stored settings as an independent object or initializes them.
   * setSettings() has to be called to persist any changes made to this object.
   **/
  async getOrInitSettings(): Promise<StorageSettings> {
    let settings = await this.getSettings();
    if (!settings) {
      settings = {
        dataKey: this.generateDataKey(),
        encryptionKey: undefined,
      };
      await this.setSettings(settings);
    }

    return settings;
  }

  /** Updates the locally stored settings with new values. */
  async setSettings(settings: StorageSettings): Promise<void> {
    if (!this.isValidDataKey(settings.dataKey)) {
      throw new Error('dataKey is not properly formatted');
    }
    let rawEncryptionKey: string | null = null;
    if (settings.encryptionKey) {
      const key = await serializeEncryptionKey(settings.encryptionKey);
      localStorage.setItem(NAME_ENCRYPTION_KEY, key);
    } else {
      localStorage.removeItem(NAME_ENCRYPTION_KEY);
    }
    localStorage.setItem(NAME_DATA_KEY, settings.dataKey);
    this.settings$.next(settings);
  }

  isValidDataKey(key: string) {
    return DATA_KEY_REGEXP.test(key);
  }

  generateDataKey(): string {
    let key = '';
    for (let i = 0; i < DATA_KEY_BYTE_LENGTH * 2; i++) {
      if (i > 0 && i % 4 === 0) {
        key += '-';
      }
      key += getRandomInt(0, 16).toString(16);
    }

    return key;
  }
}
