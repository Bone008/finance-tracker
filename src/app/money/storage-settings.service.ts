import { Injectable } from '@angular/core';
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
  constructor() { }

  getSettings(): StorageSettings | null {
    let dataKey = localStorage.getItem('storage_settings_dataKey');
    if (!dataKey) {
      return null;
    }
    return { dataKey };
  }

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

  setSettings(settings: StorageSettings) {
    if (!this.isValidDataKey(settings.dataKey)) {
      throw new Error('dataKey is not properly formatted');
    }
    localStorage.setItem('storage_settings_dataKey', settings.dataKey);
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
