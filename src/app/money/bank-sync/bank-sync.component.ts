import { Component, OnInit } from '@angular/core';
import { delay } from 'src/app/core/util';
import { DataService } from '../data.service';
import { Observable, throwError } from 'rxjs';
import { Account } from 'src/proto/model';
import { FormGroup, FormControl, FormArray, Validators, ValidationErrors } from '@ng-stack/forms';
import { BankSyncService, BankSyncRequest, BankSyncResult } from './bank-sync.service';
import { JsonPipe } from '@angular/common';
import { tap, catchError } from 'rxjs/operators';
import { DialogService } from '../dialog.service';
import * as moment from 'moment';


interface SyncFormData {
  bankType: 'sparkasse';
  bankUrl: string;
  loginName: string;
  loginPassword: string;
  maxTransactionAge: number;
  targetAccounts: (Account | false)[];
}

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

  targetAccountsForm = new FormArray<Account | false>([
    new FormControl(false),
    new FormControl(false),
    new FormControl(false),
    new FormControl(false),
  ], validateAnyAccounts);
  form = new FormGroup<SyncFormData>({
    bankType: new FormControl('sparkasse', Validators.required),
    bankUrl: new FormControl('', [Validators.required, validateUrl]),
    loginName: new FormControl('', Validators.required),
    loginPassword: new FormControl('', Validators.required),
    maxTransactionAge: new FormControl(31, [Validators.required, Validators.min(1)]),
    targetAccounts: this.targetAccountsForm,
  });

  syncLog: string = '';

  constructor(
    private readonly bankSyncService: BankSyncService,
    private readonly dataService: DataService,
    private readonly dialogService: DialogService
  ) {
    this.allAccounts$ = this.dataService.accounts$;
  }

  ngOnInit() { }

  onSubmit() {
    this.form.disable();
    this.clearLog();

    // TODO: Decouple sync logic from form input and move most of this into
    // BankSyncService, in order to allow periodic background sync to be invoked
    // more easily.

    const data = this.form.value;
    // Reduce target accounts to list of indices that we want to request.
    const accountMappings = data.targetAccounts
      .map((acc, i) => <AccountMapping>{
        bankAccountIndex: i,
        localAccountId: acc ? acc.id : 0
      })
      .filter(mapping => mapping.localAccountId > 0);

    const request = {
      bankType: data.bankType,
      bankUrl: data.bankUrl,
      loginName: data.loginName,
      loginPassword: data.loginPassword,
      maxTransactionAge: data.maxTransactionAge,
      accountIndices: accountMappings.map(mapping => mapping.bankAccountIndex),
    };

    this.showLog('Starting bank sync ...');
    this.bankSyncService.requestSync(request)
      .pipe(tap(() => this.form.enable(), () => this.form.enable()))
      .subscribe(response => {
        if (response.success) {
          this.showLog(`Success! Received ${response.results.length} CSV files.`);
          this.processResults(response.results, accountMappings);
        } else {
          this.showLog('Unsuccessful!');
          this.showLog();
          this.showLog(response.error);
          if (response.errorDetails) {
            this.showLog();
            this.showLog("Details:")
            this.showLog(response.errorDetails);
          }
        }
      }, err => {
        this.syncLog += 'An error occured!\n';
        this.syncLog += JSON.stringify(err.error, null, 2);
      });
  }

  private async processResults(results: BankSyncResult[], accountMappings: AccountMapping[]) {
    const syncId = moment().format('YYYY-MM-DD-HH-mm-ss');

    for (let i = 0; i < results.length; i++) {
      const csvString = results[i].data;
      const targetAccountId = accountMappings[i].localAccountId;
      const targetAccount = this.dataService.getAccountById(targetAccountId);

      const name = `autosync_${syncId}_acc${accountMappings[i].bankAccountIndex}.csv`;
      const csvFile = new File([csvString], name, { type: 'application/octet-stream' });
      const dialog = this.dialogService.openAccountImport(targetAccount, csvFile);

      // Delay next import until dialog is closed.
      const result = await dialog.afterClosed().toPromise();
      this.showLog(`Import into ${targetAccount.name}: ${result ? 'DONE' : 'CANCELLED'}`);
    }
  }

  private clearLog() {
    this.syncLog = '';
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
