import { Component, OnInit } from '@angular/core';
import { FormArray, FormControl, FormGroup, ValidationErrors, Validators } from '@ng-stack/forms';
import * as moment from 'moment';
import { Observable } from 'rxjs';
import { filter, finalize, map } from 'rxjs/operators';
import { RequiredProto } from 'src/app/core/proto-util';
import { Account, BankSyncSettings, IBankSyncSettings } from 'src/proto/model';
import { DataService } from '../data.service';
import { DialogService } from '../dialog.service';
import { BankSyncRequest, BankSyncResult, BankSyncService, BankType } from './bank-sync.service';

/**
 * Since the sync script reencodes all CSV files as UTF-8, we want to override
 * the account's default setting upon import.
 */
const FORCED_IMPORT_ENCODING = 'utf-8';

const HARDCODED_DKB_BANK_URL = 'https://www.dkb.de/';

interface AccountMapping {
  bankAccountIndex: number;
  localAccountId: number;
}

@Component({
  selector: 'app-bank-sync',
  templateUrl: './bank-sync.component.html',
  styleUrls: ['./bank-sync.component.css']
})
export class BankSyncComponent implements OnInit {
  readonly allAccounts$: Observable<Account[]>;

  targetAccountsForm = new FormArray<number>([
    new FormControl<number>(0),
    new FormControl<number>(0),
    new FormControl<number>(0),
    new FormControl<number>(0),
    new FormControl<number>(0),
    new FormControl<number>(0),
  ], validateAnyAccounts);
  form = new FormGroup<RequiredProto<IBankSyncSettings>>({
    bankType: new FormControl<string>('sparkasse', Validators.required),
    bankUrl: new FormControl<string>('', [Validators.required, validateUrl]),
    loginName: new FormControl<string>('', Validators.required),
    loginPassword: new FormControl<string>('', Validators.required),
    maxTransactionAgeDays: new FormControl<number>(31, [Validators.required, Validators.min(1)]),
    targetAccountIds: this.targetAccountsForm,
  });

  syncLog: string = '';
  lastSyncError = '';
  lastSyncSuccess = false;

  constructor(
    private readonly bankSyncService: BankSyncService,
    private readonly dataService: DataService,
    private readonly dialogService: DialogService
  ) {
    this.allAccounts$ = this.dataService.accounts$;

    // Remember default values since FormGroup does not allow access to them later.
    const formDefaultValues = this.form.getRawValue();

    let lastBankType: string | null = null;
    this.form.controls.bankType.valueChanges.subscribe(bankType => {
      // The callback is called in situations where we do not want to react.
      if (bankType === lastBankType)
        return;
      lastBankType = bankType;

      // Load from matching settings if available, otherwise reset to empty.
      const bankSyncEntries = this.dataService.getUserSettings().bankSyncEntries;
      let storedEntry = bankSyncEntries.find(entry => entry.bankType === bankType);
      if (storedEntry) {
        this.form.patchValue(storedEntry, { emitEvent: false });
      } else {
        const resetValues = { ...formDefaultValues, bankType };
        this.form.reset(resetValues, { emitEvent: false });
      }

      this.checkForHardcodedURL();
    });

    this.dataService.userSettings$
      .pipe(filter(settings => settings.bankSyncEntries.length > 0))
      .pipe(map(settings => settings.bankSyncEntries!))
      .subscribe(entries => {
        // By default, use the first stored settings, since those are the most
        // recently used bank type. It is enough to set the bank type, the handler
        // above will do the rest.
        this.form.controls.bankType.setValue(entries[0].bankType);
      });
  }

  ngOnInit() { }

  getAccount = this.dataService.accountFromIdFn;

  onSubmit() {
    this.form.disable();
    this.clearLog();
    const startTime = moment();

    // TODO: Decouple sync logic from form input and move most of this into
    // BankSyncService, in order to allow periodic background sync to be invoked
    // more easily.

    // Use getRawValue() to include disabled controls, otherwise data may be empty.
    const data = this.form.getRawValue();
    this.saveSyncSettings(data);

    // Reduce target accounts to list of indices that we want to request.
    const accountMappings = data.targetAccountIds
      .map((accId, i) => <AccountMapping>{
        bankAccountIndex: i,
        localAccountId: accId,
      })
      .filter(mapping => mapping.localAccountId > 0);

    const request: BankSyncRequest = {
      bankType: data.bankType as BankType,
      bankUrl: data.bankUrl,
      loginName: data.loginName,
      loginPassword: data.loginPassword,
      maxTransactionAge: data.maxTransactionAgeDays,
      accountIndices: accountMappings.map(mapping => mapping.bankAccountIndex),
    };

    this.showLog('Starting bank sync ...');
    this.bankSyncService.requestSync(request)
      .pipe(finalize(() => {
        this.form.enable();
        this.checkForHardcodedURL();

        const duration = moment().diff(startTime, 'seconds');
        this.showLog(`Execution time: ${Math.round(duration)} s`);
      }))
      .subscribe(response => {
        if (response === null) {
          response = { success: undefined, error: 'Empty response received!' };
        }
        if (response.success) {
          this.showLog(`Success! Received ${response.results.length} CSV files.`);
          this.lastSyncSuccess = true;
          this.processResults(response.results, accountMappings);
        } else {
          this.showLog('Unsuccessful!');
          this.showLog();
          this.showLog(response.error);
          this.lastSyncError = response.error;
          if (response.errorDetails) {
            this.showLog();
            this.showLog("Details:")
            this.showLog(response.errorDetails);
          }
        }
      }, err => {
        this.syncLog += 'An error occured!\n';
        this.syncLog += JSON.stringify(err, null, 2);
      });
  }

  private async processResults(results: BankSyncResult[], accountMappings: AccountMapping[]) {
    const syncId = moment().format('YYYY-MM-DD-HH-mm-ss');

    if (results.length !== accountMappings.length) {
      const msg = `WARNING: Received results for ${results.length} accounts, but requested ${accountMappings.length}! Results may not match.`;
      this.showLog(msg);
      alert(msg);
    }

    for (let i = 0; i < results.length; i++) {
      const csvString = results[i].data;
      const targetAccountId = accountMappings[i].localAccountId;
      const targetAccount = this.dataService.getAccountById(targetAccountId);
      if (csvString === null) {
        // TODO: Replace with nicer message dialog.
        alert(`Account: ${targetAccount.name}\n\nThe sync was successful, but there are no transactions in the given date range.`);
        this.showLog(`Import into ${targetAccount.name}: EMPTY`);
        continue;
      }

      const name = `autosync_${syncId}_acc${accountMappings[i].bankAccountIndex}.csv`;
      const csvFile = new File([csvString], name, { type: 'application/octet-stream' });
      const dialog = this.dialogService.openAccountImport(targetAccount, csvFile, FORCED_IMPORT_ENCODING);

      // Delay next import until dialog is closed.
      const result = await dialog.afterClosed().toPromise();
      this.showLog(`Import into ${targetAccount.name}: ${result ? 'DONE' : 'CANCELLED'}`);
    }
  }

  private saveSyncSettings(bankSync: IBankSyncSettings) {
    const entries = this.dataService.getUserSettings().bankSyncEntries;
    const existingIndex = entries.findIndex(entry => entry.bankType === bankSync.bankType);
    // Remove existing settings and reinsert at the front of the list.
    if (existingIndex >= 0) {
      entries.splice(existingIndex, 1);
    }
    const newSettings = new BankSyncSettings(bankSync);
    entries.unshift(newSettings);
  }

  /** Special case for DKB: Disable URL field when selected. */
  private checkForHardcodedURL() {
    const bankUrlControl = this.form.controls.bankUrl;
    if (this.form.controls.bankType.value === 'dkb') {
      bankUrlControl.disable();
      bankUrlControl.setValue(HARDCODED_DKB_BANK_URL);
    } else {
      bankUrlControl.enable();
    }
  }

  private clearLog() {
    this.syncLog = '';
    this.lastSyncSuccess = false;
    this.lastSyncError = '';
  }

  private showLog(message = '') {
    this.syncLog += message + '\n';
  }

}

function validateUrl(control: FormControl): ValidationErrors | null {
  try {
    new URL(control.value);
    return null;
  }
  catch (e) {
    return { invalidUrl: true };
  }
}

function validateAnyAccounts(array: FormArray): ValidationErrors | null {
  if (array.value.some(v => !!v)) {
    return null;
  } else {
    return { noTargetAccounts: true };
  }
}
