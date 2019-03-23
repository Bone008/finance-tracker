import { MediaMatcher } from '@angular/cdk/layout';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import * as moment from 'moment';
import { timer } from 'rxjs';
import { takeWhile } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { DataContainer } from '../../proto/model';
import { timestampToDate } from '../core/proto-util';
import { DataService } from './data.service';
import { DialogService } from './dialog.service';
import { StorageSettingsService } from './storage-settings.service';
import { StorageService } from './storage.service';

@Component({
  selector: 'app-money',
  templateUrl: './money.component.html',
  styleUrls: ['./money.component.css']
})
export class MoneyComponent implements OnInit, OnDestroy {
  hasData = false;
  status: string | null = null;

  mobileQuery: MediaQueryList;
  private _mobileQueryListener: () => void;
  private alive = true;

  constructor(
    private readonly dataService: DataService,
    private readonly storageService: StorageService,
    private readonly storageSettingsService: StorageSettingsService,
    private readonly dialogService: DialogService,
    changeDetectorRef: ChangeDetectorRef, media: MediaMatcher
  ) {
    this.mobileQuery = media.matchMedia('screen and (max-width: 959px)');
    this._mobileQueryListener = () => changeDetectorRef.detectChanges();
    this.mobileQuery.addListener(this._mobileQueryListener);
  }

  ngOnInit() {
    this.refreshData();

    timer(0, 60000).pipe(takeWhile(() => this.alive)).subscribe(() => {
      if (this.status && this.status.indexOf("Last saved") === 0) {
        this.status = "Last saved " + this.formatDate(
          timestampToDate(this.dataService.getDataContainer().lastModified));
      }
    });
  }

  ngOnDestroy(): void {
    this.mobileQuery.removeListener(this._mobileQueryListener);
    this.alive = false;
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
          if (!environment.production) {
            window['DEBUG_DATA'] = data;
          }

          this.dataService.setDataContainer(data);
          if (data.lastModified) {
            this.status = "Last saved " + this.formatDate(timestampToDate(data.lastModified));
          } else {
            this.status = "No saved data";
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

  private formatDate(date: Date): string {
    return moment(date).fromNow();
  }

}
