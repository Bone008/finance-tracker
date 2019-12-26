import { MediaMatcher } from '@angular/cdk/layout';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import * as moment from 'moment';
import { ShortcutInput } from 'ng-keyboard-shortcuts';
import { from, fromEvent, merge, of, Subject, timer } from 'rxjs';
import { catchError, filter, map, mergeMap, switchMap, takeWhile, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { DataContainer } from 'src/proto/model';
import { LoggerService } from '../core/logger.service';
import { timestampToDate } from '../core/proto-util';
import { DataService } from './data.service';
import { DialogService } from './dialog.service';
import { createDefaultDataContainer } from './model-util';
import { StorageSettingsService } from './storage-settings.service';
import { StorageService } from './storage.service';

@Component({
  selector: 'app-money',
  templateUrl: './money.component.html',
  styleUrls: ['./money.component.css']
})
export class MoneyComponent implements OnInit, OnDestroy {
  readonly shortcuts: ShortcutInput[] = [
    { key: 'ctrl + s', command: () => this.syncData(), preventDefault: true }
  ];

  hasData = false;
  status: string | null = null;

  mobileQuery: MediaQueryList;
  private _mobileQueryListener: () => void;
  private alive = true;
  private isStaleNotificationPending = false;
  private readonly refreshSubject = new Subject<void>();

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
      this.storageSettingsService.getOrInitSettings().catch(e =>
        this.loggerService.error('Unable to perform initial load of settings.', e));

      this.dialogService.openWelcome();
    }
    // Attempt refresh whenever data key changes (also initially).
    this.storageSettingsService.settings$.subscribe(() => {
      this.refreshData();
    });

    // React to all kinds of refresh attempts, using switchMap against races.
    this.refreshSubject
      .pipe(tap(() => this.status = "Loading ..."))
      .pipe(switchMap(() => from(this.storageService.loadData())
        .pipe(map(data => {
          if (data === null) {
            return <[DataContainer, string | null]>[createDefaultDataContainer(), 'No saved data'];
          } else {
            return <[DataContainer, string | null]>[data, null];
          }
        }))
        // Note: catchError needs to be bound to the Observable WITHIN switchMap,
        // otherwise the main observable gets killed after an error.
        .pipe(catchError(error => {
          this.loggerService.error(error);
          return of(<[DataContainer, string | null]>[createDefaultDataContainer(), '' + error]);
        }))))
      .subscribe(([data, error]) => {
        if (!environment.production) {
          window['DEBUG_DATA'] = data;
        }

        this.hasData = true;
        this.dataService.setDataContainer(data);
        if (data.lastModified) {
          this.status = "Last saved " + this.formatDate(timestampToDate(data.lastModified));
        } else if (!error) {
          this.status = "No saved data";
        } else {
          this.status = error;
        }
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
    if (this.hasData && this.storageService.getLastLoadSuccessful()) {
      const choice = confirm("Refreshing data from the server will overwrite all unsaved changes. Are you sure?");
      if (!choice) return;
    }
    this.refreshSubject.next();
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
