import { Component, OnInit } from '@angular/core';
import { delay } from 'src/app/core/util';
import { DataService } from '../data.service';
import { Observable, throwError } from 'rxjs';
import { Account } from 'src/proto/model';
import { FormGroup, FormControl, FormArray, Validators, ValidationErrors } from '@ng-stack/forms';
import { BankSyncService, BankSyncRequest } from './bank-sync.service';
import { JsonPipe } from '@angular/common';
import { tap, catchError } from 'rxjs/operators';


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

  syncLog: string | null = null;

  constructor(
    private readonly bankSyncService: BankSyncService,
    private readonly dataService: DataService) {
    this.allAccounts$ = this.dataService.accounts$;
  }

  ngOnInit() { }

  onSubmit() {
    this.form.disable();

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

    this.syncLog = 'Starting bank sync ...\n';
    this.bankSyncService.requestSync(request)
      .pipe(tap(() => this.form.enable(), () => this.form.enable()))
      .subscribe(response => {
        this.syncLog += JSON.stringify(response, null, 2); + '\n';

        if(response.stdout) {
          this.syncLog += '\nSTDOUT:\n' + response.stdout + '\n';
        }
        if(response.stderr) {
          this.syncLog += '\nSTDERR:\n' + response.stderr + '\n';
        }
      }, err => {
        this.syncLog += 'An error occured!\n';
        this.syncLog += JSON.stringify(err.error, null, 2);
      });

    /*this.syncLog = '[DUMMY] Loading stuff ...\n';
    this.syncLog += JSON.stringify(this.form.value) + '\n';
    for (let i = 0; i < 4; i++) {
      await delay(100);
      this.syncLog += '[DUMMY] Did the login.\n';
      await delay(70);
      this.syncLog += '[DUMMY] Baked some cookies.\n';
      await delay(550);
      this.syncLog += '[DUMMY] Also some toast now.\n';
      await delay(200);
      this.syncLog += '[DUMMY] Saying good bye to strangers ...\n';
    }
    await delay(800);
    this.syncLog += '[DUMMY] Done!\n';
    this.form.enable();*/
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
