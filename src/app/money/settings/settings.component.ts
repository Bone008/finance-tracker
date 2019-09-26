import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import * as moment from 'moment';
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
  readonly storageSettings: StorageSettings;

  constructor(
    private readonly storageSettingsService: StorageSettingsService,
    private readonly storageService: StorageService,
    private readonly dataService: DataService,
    private readonly router: Router
  ) {
    // Storage service returns an independent copy, so we can modify the object
    // directly.
    this.storageSettings = this.storageSettingsService.getSettings()
      || {
        dataKey: '',
      };
  }

  ngOnInit() {
  }

  randomizeDataKey() {
    this.storageSettings.dataKey = this.storageSettingsService.generateDataKey();
  }

  hasStorageChanges(): boolean {
    const originalSettings = this.storageSettingsService.getSettings();
    return !originalSettings || originalSettings.dataKey !== this.storageSettings.dataKey;
  }

  onSubmit() {
    if (!this.hasStorageChanges()) { return; }

    // Data will be refreshed automatically by the subscriber in MoneyComponent.
    this.storageSettingsService.setSettings(this.storageSettings);
    this.router.navigate(['/']);
  }

  exportData() {
    const persistedSettings = this.storageSettingsService.getSettings();
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
      delay(1000).then(() => {
        window.URL.revokeObjectURL(url);
      });
    }
  }
}
