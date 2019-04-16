import { Component, OnInit } from '@angular/core';
import * as moment from 'moment';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { cloneMessage, moneyToNumber, protoDateToMoment, timestampToMoment } from 'src/app/core/proto-util';
import { maxBy } from 'src/app/core/util';
import { Account, KnownBalance, TransactionData } from 'src/proto/model';
import { CurrencyService } from '../currency.service';
import { DataService } from '../data.service';
import { DialogService } from '../dialog.service';
import { extractTransactionData } from '../model-util';

export interface AccountInfo {
  balance: number;
  lastKnownBalanceMoment: moment.Moment | null;
  numTransactionsSinceLastKnown: number;
}

@Component({
  selector: 'app-accounts',
  templateUrl: './accounts.component.html',
  styleUrls: ['./accounts.component.css']
})
export class AccountsComponent implements OnInit {
  // Observable of all accounts in the db.
  readonly accounts$: Observable<Account[]>;
  // Observable of all unique used currencies of the accounts.
  readonly usedCurrencies$: Observable<string[]>;

  private accountInfosById: AccountInfo[] = [];
  private accountEditSubject = new BehaviorSubject<void>(void (0));

  constructor(
    private readonly dataService: DataService,
    private readonly currencyService: CurrencyService,
    private readonly dialogService: DialogService,
  ) {
    // Observable that updates whenever account list or individual accounts are updated.
    const accountsObservable = combineLatest(this.dataService.accounts$, this.accountEditSubject)
      .pipe(map(([accounts, _]) => accounts));

    this.accounts$ = accountsObservable.pipe(
      tap(accounts => this.computeAccountInfos(accounts))
    );
    this.usedCurrencies$ = accountsObservable.pipe(
      map(accounts => Array.from(new Set<string>(accounts.map(a => a.currency))).sort())
    );
  }

  ngOnInit() {
  }

  getMainCurrency(): string {
    return this.dataService.getUserSettings().mainCurrency;
  }

  setMainCurrency(value: string) {
    this.dataService.getUserSettings().mainCurrency = value;
  }

  /** Opens dialog to create a new account. */
  startAdd() {
    const account = new Account({
    });

    this.dialogService.openAccountEdit(account, 'add')
      .afterConfirmed().subscribe(() => {
        //account.created = timestampNow();
        this.dataService.addAccounts(account);
      });
  }

  /** Opens dialog to edit an existing account. */
  startEdit(account: Account) {
    const temp = cloneMessage(Account, account);
    this.dialogService.openAccountEdit(temp, 'edit')
      .afterConfirmed().subscribe(() => {
        Object.assign(account, temp);
        //account.modified = timestampNow();
        this.accountEditSubject.next(void (0));
      });
  }

  delete(account: Account) {
    const numReferring = this.getTxDataForAccount(account).length;
    if (numReferring > 0) {
      alert(`This account is associated with ${numReferring} individual transactions and cannot be deleted.`);
      return;
    }
    this.dataService.removeAccounts(account);
  }

  openBalances(account: Account) {
    this.dialogService.openBalances(account).afterClosed().subscribe(() => {
      // Note: Don't subscribe the subject directly, as it will be completed otherwise.
      this.accountEditSubject.next();
    });
  }


  getCurrencySymbol(currencyCode: string): string {
    return this.currencyService.getSymbol(currencyCode);
  }

  formatBalance(account: Account): string {
    return this.currencyService.format(this.accountInfosById[account.id].balance, account.currency);
  }

  getAccountInfo(account: Account): AccountInfo {
    return this.accountInfosById[account.id];
  }

  /** Updates the accountInfosById field with new calculations. */
  private computeAccountInfos(accounts: Account[]) {
    this.accountInfosById = [];
    for (const account of accounts) {
      this.accountInfosById[account.id] = this.computeInfo(account);
    }
  }

  /** Calculates view model data for a specific account. */
  private computeInfo(account: Account): AccountInfo {
    const lastKnown = this.getLastKnownBalance(account);

    let txDatas = this.getTxDataForAccount(account);
    if (lastKnown) {
      // Restrict to transactions that happened AFTER the last known balance.
      const startMoment = protoDateToMoment(lastKnown.date);
      txDatas = txDatas
        .filter(data => timestampToMoment(data.date).isAfter(startMoment, 'day'));
    }

    const startBalance = lastKnown ? moneyToNumber(lastKnown.balance) : 0;
    const balance = txDatas.reduce((acc, data) => acc + moneyToNumber(data.amount), startBalance);

    return {
      balance,
      lastKnownBalanceMoment: lastKnown ? protoDateToMoment(lastKnown.date) : null,
      numTransactionsSinceLastKnown: txDatas.length,
    };
  }

  private getLastKnownBalance(account: Account): KnownBalance | null {
    return maxBy(account.knownBalances, known => protoDateToMoment(known.date).valueOf());
  }

  private getTxDataForAccount(account: Account): TransactionData[] {
    return extractTransactionData(this.dataService.getCurrentTransactionList())
      .filter(data => data.accountId === account.id);
  }
}
