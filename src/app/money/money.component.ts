import { MediaMatcher } from '@angular/cdk/layout';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import * as moment from 'moment';
import { fromEvent, merge, timer } from 'rxjs';
import { filter, mergeMap, switchMap, takeWhile } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { DataContainer } from '../../proto/model';
import { LoggerService } from '../core/logger.service';
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
  private isStaleNotificationPending = false;

  constructor(
    private readonly dataService: DataService,
    private readonly storageService: StorageService,
    private readonly storageSettingsService: StorageSettingsService,
    private readonly dialogService: DialogService,
    private readonly loggerService: LoggerService,
    private readonly titleService: Title,
    private readonly activatedRoute: ActivatedRoute,
    private readonly router: Router,
    changeDetectorRef: ChangeDetectorRef, media: MediaMatcher
  ) {
    this.mobileQuery = media.matchMedia('screen and (max-width: 959px)');
    this._mobileQueryListener = () => changeDetectorRef.detectChanges();
    this.mobileQuery.addListener(this._mobileQueryListener);
  }

  ngOnInit() {
    // Make page title follow the router.
    const baseTitle = this.titleService.getTitle();
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        mergeMap(() => this.activatedRoute.firstChild!.data)
      )
      .subscribe(data => {
        const routeTitle = data['title'];
        if (routeTitle) {
          this.titleService.setTitle(baseTitle + ' - ' + routeTitle);
        } else {
          this.titleService.setTitle(baseTitle);
        }
      });

    // On first visit, initialize data key so the user can immediately start.
    if (!this.storageSettingsService.hasSettings()) {
      this.storageSettingsService.getOrInitSettings();
    }
    // Attempt refresh whenever data key changes (also initially).
    this.storageSettingsService.settings$.subscribe(() => {
      this.refreshData();
    });

    const periodicTimer = timer(0, 60 * 1000)
      .pipe(
        takeWhile(_ => this.alive),
        filter(i => i === 0 || document.visibilityState !== 'hidden')
      );
    const onFocusEvent = fromEvent(document, 'visibilitychange')
      .pipe(filter(_ => document.visibilityState === 'visible'));
    const onFocusAndPeriodically = merge(periodicTimer, onFocusEvent);

    // Keep checking freshness of data.
    onFocusAndPeriodically.pipe(
      switchMap(() => this.storageService.checkIsDataStale().catch(error => {
        this.loggerService.error("Could not check for staleness of data!", error);
        return false;
      }))
    ).subscribe(value => this.notifyStaleData(value));

    // Update relative time display.
    onFocusAndPeriodically.subscribe(() => {
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

  async syncData(): Promise<void> {
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

  private notifyStaleData(isStale: boolean) {
    if (!isStale) return;
    if (this.isStaleNotificationPending) return;

    this.status = "Out of sync!";
    this.isStaleNotificationPending = true;
    const dialog = this.dialogService.openStaleData();
    dialog.afterClosed().subscribe(() => this.isStaleNotificationPending = false);
    dialog.afterConfirmed().subscribe(() => {
      this.refreshData();
    });
  }

}
