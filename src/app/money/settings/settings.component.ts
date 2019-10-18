import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import * as moment from 'moment';
import { LoggerService } from 'src/app/core/logger.service';
import { delay } from 'src/app/core/util';
import { DataService } from '../data.service';
import { DATA_KEY_REGEXP, StorageSettings, StorageSettingsService } from '../storage-settings.service';
import { StorageService } from '../storage.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit {
  readonly dataKeyPattern = DATA_KEY_REGEXP;
  storageSettings: StorageSettings;
  newPassword: string | null = null;

  hasPasswordError = false;

  private originalSettings: StorageSettings | null = null;

  constructor(
    private readonly storageSettingsService: StorageSettingsService,
    private readonly storageService: StorageService,
    private readonly dataService: DataService,
    private readonly loggerService: LoggerService,
    private readonly router: Router
  ) {
    this.storageSettings = { dataKey: '', encryptionKey: undefined };

    this.storageSettingsService.getSettings().then(settings => {
      this.originalSettings = settings;
      if (settings) {
        this.storageSettings = Object.assign({}, settings);
      }
    });
  }

  ngOnInit() {
  }

  randomizeDataKey() {
    this.storageSettings.dataKey = this.storageSettingsService.generateDataKey();
  }

  hasStorageChanges(): boolean {
    return this.newPassword !== null || !this.originalSettings || this.originalSettings.dataKey !== this.storageSettings.dataKey;
  }

  onSubmit() {
    this.updateSettings().catch(e => this.loggerService.error(e));
  }

  async updateSettings(): Promise<void> {
    if (!this.hasStorageChanges()) { return; }
    if (!this.newPassword) { return; }

    // TODO: Like this you cannot change the password for an existing DB.
    try {
      const key = await this.storageService.convertToEncryptionKey(this.storageSettings.dataKey, this.newPassword);
      this.storageSettings.encryptionKey = key;
      this.newPassword = null;
      this.hasPasswordError = false;
    } catch (e) {
      this.loggerService.error('Error trying to validate new storage settings:', e);
      this.hasPasswordError = true;
      return;
    }

    // Data will be refreshed automatically by the subscriber in MoneyComponent.
    await this.storageSettingsService.setSettings(this.storageSettings);
    this.router.navigate(['/']);
  }

  async exportData(): Promise<void> {
    const persistedSettings = await this.storageSettingsService.getSettings();
    if (!persistedSettings) {
      alert('No saved storage key found!');
      return;
    }
    const nowStr = moment().format('YYYY-MM-DD-HH-mm-ss');
    const fileName = persistedSettings.dataKey + '--' + nowStr + '.bin';

    const binaryData = this.storageService.encodeAndCompressData(
      this.dataService.getDataContainer());
    // Offer file for download. Since MS browsers do not support the File
    // constructor, we have to fall back to its specific API here.
    // See https://stackoverflow.com/q/19327749.
    if (window.navigator && window.navigator.msSaveOrOpenBlob) {
      const blob = new Blob([binaryData], { type: 'application/octet-stream' });
      window.navigator.msSaveOrOpenBlob(blob, fileName);
    } else {
      const file = new File([binaryData], fileName, { type: 'application/octet-stream' });
      const url = window.URL.createObjectURL(file);
      window.location.assign(url);
      await delay(1000);
      window.URL.revokeObjectURL(url);
    }
  }
}
