import { Component, OnInit, Output } from '@angular/core';
import { DataContainer } from '../../proto/model';
import { timestampToDate } from '../core/proto-util';
import { DataService } from './data.service';
import { DialogService } from './dialog.service';
import { StorageSettingsService } from './storage-settings.service';
import { createDummyTransactions, StorageService } from './storage.service';

@Component({
  selector: 'app-money',
  templateUrl: './money.component.html',
  styleUrls: ['./money.component.css']
})
export class MoneyComponent implements OnInit {
  hasData = false;

  @Output() status: string | null = null;

  constructor(
    private readonly dataService: DataService,
    private readonly storageService: StorageService,
    private readonly storageSettingsService: StorageSettingsService,
    private readonly dialogService: DialogService, ) { }

  ngOnInit() {
    this.refreshData();
  }

  openSettings() {
    const storageSettings = this.storageSettingsService.getOrInitSettings();
    const originalSettings = Object.assign({}, storageSettings);

    this.dialogService.openSettings(storageSettings)
      .afterConfirmed().subscribe(() => {
        this.storageSettingsService.setSettings(storageSettings);

        const hasChanges = Object.keys(originalSettings).some(
          key => originalSettings[key] !== storageSettings[key]);
        if (hasChanges) {
          this.refreshData();
        }
      });
  }

  refreshData() {
    if (this.hasData) {
      const choice = confirm("Refreshing data from the server will overwrite all unsaved changes. Are you sure?");
      if (!choice) return;
    }

    this.status = "Loading ...";
    this.storageService.loadData()
      .then(
        data => {
          if (data) {
            this.dataService.setDataContainer(data);
            this.status = "Last saved " + this.formatDate(timestampToDate(data.lastModified));
          } else {
            this.dataService.setDataContainer(new DataContainer({
              transactions: createDummyTransactions(50),
            }));
            this.status = "Using dummy data";
          }
        },
        error => {
          this.dataService.setDataContainer(new DataContainer());
          this.status = error;
        })
      .then(() => this.hasData = true);
  }

  async syncData() {
    if (!this.hasData) return;

    this.status = "Saving ...";

    const data = this.dataService.getDataContainer();

    try {
      await this.storageService.saveData(data);
      this.status = "Last saved " + this.formatDate(timestampToDate(data.lastModified));
    } catch (e) {
      this.status = e;
    }
  }

  private formatDate(date: Date) {
    if (date.toDateString() === (new Date()).toDateString()) {
      return date.toLocaleTimeString();
    } else {
      return date.toLocaleString();
    }
  }

}
