import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
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
    @Inject(MAT_DIALOG_DATA) data: { storageSettings: StorageSettings },
    private readonly storageSettingsService: StorageSettingsService,
    private readonly matDialogRef: MatDialogRef<SettingsComponent>
  ) {
    this.storageSettings = data.storageSettings;
  }

  ngOnInit() {
  }

  randomizeDataKey() {
    this.storageSettings.dataKey = this.storageSettingsService.generateDataKey();
  }

  onSubmit() {
    this.matDialogRef.close(true);
  }
}
