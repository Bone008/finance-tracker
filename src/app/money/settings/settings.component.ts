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

  isEnteringPassword(): boolean {
    // Reason for check for this.storageService.getLastLoadSuccessful():
    // If the already stored key is no longer correct, the user needs to enter
    // the correct password, without falling into the "change password" flow.
    return this.newPassword !== null || this.hasStorageChanges() || !this.storageSettings.encryptionKey || !this.storageService.getLastLoadSuccessful();
  }

  hasChangePasswordIntent(): boolean {
    return !!this.originalSettings && this.originalSettings.dataKey === this.storageSettings.dataKey
      && !!this.storageSettings.encryptionKey
      && this.newPassword !== null
      && this.storageService.getLastLoadSuccessful();
  }

  onSubmit() {
    this.updateSettings().catch(e => this.loggerService.error(e));
  }

  async updateSettings(): Promise<void> {
    if (!this.hasStorageChanges()) { return; }
    if (!this.newPassword) { return; }
    this.hasPasswordError = false;

    if (this.hasChangePasswordIntent()) {
      const key = await this.storageService.convertToEncryptionKey(null, this.newPassword);
      this.storageSettings.encryptionKey = key;
      // Immediately save data with the new password.
      try {
        await this.storageService.saveData(this.dataService.getDataContainer(), this.storageSettings);
        alert("The password has been changed successfully!");
      }
      catch (e) {
        alert("Failed to change password: " + e);
        return;
      }
    }
    else {
      try {
        const key = await this.storageService.convertToEncryptionKey(this.storageSettings.dataKey, this.newPassword);
        this.storageSettings.encryptionKey = key;
      } catch (e) {
        this.loggerService.error('Error trying to validate new storage settings:', e);
        this.hasPasswordError = true;
        return;
      }
    }
    this.newPassword = null;

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
