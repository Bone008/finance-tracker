import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { getRandomInt } from '../core/util';

/** Regular expression that only matches properly formatted data keys. */
export const DATA_KEY_REGEXP = /^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/;
const DATA_KEY_BYTE_LENGTH = 8;

export interface StorageSettings {
  dataKey: string;
}

@Injectable({
  providedIn: 'root'
})
export class StorageSettingsService {
  /** Observable subject that is updated whenever storage settings change. */
  readonly settings$: BehaviorSubject<StorageSettings | null>;

  constructor() {
    this.settings$ = new BehaviorSubject<StorageSettings | null>(
      this.getSettings());
  }

  hasSettings(): boolean {
    return localStorage.getItem('storage_settings_dataKey') !== null;
  }

  /**
   * Returns the stored settings as an independent object or null if not found.
   * setSettings() has to be called to persist any changes made to this object.
   **/
  getSettings(): StorageSettings | null {
    let dataKey = localStorage.getItem('storage_settings_dataKey');
    if (!dataKey) {
      return null;
    }
    return { dataKey };
  }

  /**
   * Returns the stored settings as an independent object or initializes them.
   * setSettings() has to be called to persist any changes made to this object.
   **/
  getOrInitSettings(): StorageSettings {
    let settings = this.getSettings();
    if (!settings) {
      settings = {
        dataKey: this.generateDataKey(),
      };
      this.setSettings(settings);
    }

    return settings;
  }

  /** Updates the locally stored settings with new values. */
  setSettings(settings: StorageSettings) {
    if (!this.isValidDataKey(settings.dataKey)) {
      throw new Error('dataKey is not properly formatted');
    }
    localStorage.setItem('storage_settings_dataKey', settings.dataKey);
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
