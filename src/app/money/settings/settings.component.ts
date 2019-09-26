import { Component, OnInit } from '@angular/core';
import { DATA_KEY_REGEXP, StorageSettings, StorageSettingsService } from '../storage-settings.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit {
  readonly dataKeyPattern = DATA_KEY_REGEXP;
  readonly storageSettings: StorageSettings;

  constructor(
    private readonly storageSettingsService: StorageSettingsService
  ) {
    // Storage service returns an independent copy, so we can modify the object
    // directly.
    this.storageSettings = this.storageSettingsService.getOrInitSettings();
  }

  ngOnInit() {
  }

  randomizeDataKey() {
    this.storageSettings.dataKey = this.storageSettingsService.generateDataKey();
  }

  hasStorageChanges(): boolean {
    const originalSettings = this.storageSettingsService.getSettings();
    return !!originalSettings && originalSettings.dataKey !== this.storageSettings.dataKey;
  }

  onSubmit() {
    if (!this.hasStorageChanges()) { return; }

    this.storageSettingsService.setSettings(this.storageSettings);
    // Data will be refreshed automatically by the subscriber in MoneyComponent.
  }
}
