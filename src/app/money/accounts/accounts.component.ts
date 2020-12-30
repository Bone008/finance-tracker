import { Component, OnInit } from '@angular/core';
import * as moment from 'moment';
import { BehaviorSubject, combineLatest, Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { cloneMessage, moneyToNumber, protoDateToMoment, timestampToMilliseconds, timestampToMoment } from 'src/app/core/proto-util';
import { escapeQuotedString, maxBy } from 'src/app/core/util';
import { Account, KnownBalance, TransactionData } from 'src/proto/model';
import { CurrencyService } from '../currency.service';
import { DataService } from '../data.service';
import { DialogService } from '../dialog.service';
import { extractTransactionData, MONEY_EPSILON } from '../model-util';

export interface AccountInfo {
  /* Current balance in account's currency. */
  balance: number;
  /* Current balance in main currency, or null if both currencies are the same. */
  altBalance: number | null;
  lastTransactionMoment: moment.Moment | null;
  lastKnownBalanceMoment: moment.Moment | null;
  numTransactionsSinceLastKnown: number;
}

@Component({
  selector: 'app-accounts',
  templateUrl: './accounts.component.html',
  styleUrls: ['./accounts.component.css']
})
export class AccountsComponent implements OnInit {
  // Observable of all open accounts in the db.
  readonly openAccounts$: Observable<Account[]>;
  // Observable of all closed accounts in the db.
  readonly closedAccounts$: Observable<Account[]>;
  // All currency codes of all accounts.
  readonly allCurrencies: string[];

  private totalBalance: number | null = null;
  private accountInfosById: AccountInfo[] = [];
  /** Empty subject that is updated whenever an individual account is changed. */
  private accountEditSubject = new BehaviorSubject<void>(void (0));

  constructor(
    private readonly dataService: DataService,
    private readonly currencyService: CurrencyService,
    private readonly dialogService: DialogService,
  ) {
    // Observable that updates whenever account list or individual accounts are updated.
    const accountsObservable = combineLatest(this.dataService.accounts$, this.accountEditSubject)
      .pipe(map(([accounts, _]) => accounts));

    this.openAccounts$ = accountsObservable.pipe(
      tap(accounts => this.computeAccountInfos(accounts)),
      map(accounts => accounts.filter(acc => !acc.closed))
    );
    this.closedAccounts$ = accountsObservable.pipe(
      map(accounts => accounts.filter(acc => acc.closed))
    );
    this.allCurrencies = this.currencyService.getAllCodes().sort();
  }

  ngOnInit() {
  }

  /** Returns the user-selected main currency, or empty if not set. */
  getMainCurrency(): string {
    return this.dataService.getUserSettings().mainCurrency;
  }

  setMainCurrency(value: string) {
    this.dataService.getUserSettings().mainCurrency = value;
    this.accountEditSubject.next();
  }

  /** Opens dialog to create a new account. */
  startAdd() {
    const account = new Account({
      icon: 'account_balance',
      currency: this.dataService.getUserSettings().mainCurrency,
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
        this.accountEditSubject.next();
      });
  }

  /** Opens dialog to import transactions into an account. */
  startImport(account: Account) {
    this.dialogService.openAccountImport(account)
      .afterConfirmed().subscribe(() => {
        this.accountEditSubject.next();
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

  isTotalBalanceNegative(): boolean {
    return !!this.totalBalance && this.totalBalance < -MONEY_EPSILON;
  }
  formatTotalBalance(): string | null {
    if (this.totalBalance === null) {
      return null;
    }
    // Note: Use EUR-defaulting main currency here, not the explicitly set one.
    return this.currencyService.format(this.totalBalance, this.dataService.getMainCurrency());
  }

  formatBalance(account: Account): string {
    return this.currencyService.format(
      this.accountInfosById[account.id].balance,
      account.currency);
  }

  formatAltBalance(account: Account): string | null {
    const { altBalance } = this.accountInfosById[account.id];
    if (altBalance === null) {
      return null;
    }
    return this.currencyService.format(altBalance, this.dataService.getMainCurrency());
  }

  getAccountInfo(account: Account): AccountInfo {
    return this.accountInfosById[account.id];
  }

  getAccountFilterString(account: Account): string {
    return 'account=' + escapeQuotedString(account.name);
  }

  /** Updates the accountInfosById and totalBalance field with new calculations. */
  private computeAccountInfos(accounts: Account[]) {
    this.totalBalance = 0;
    this.accountInfosById = [];
    for (const account of accounts) {
      const info = this.computeInfo(account);
      if (!account.closed) {
        this.totalBalance += this.currencyService.convertAmount(
          info.balance, account.currency, this.dataService.getMainCurrency()) || 0;
      }

      this.accountInfosById[account.id] = info;
    }
  }

  /** Calculates view model data for a specific account. */
  private computeInfo(account: Account): AccountInfo {
    const lastKnown = this.getLastKnownBalance(account);

    const txDatas = this.getTxDataForAccount(account);
    const lastTransaction = maxBy(txDatas, data => timestampToMilliseconds(data.date));

    let dataSinceKnown;
    if (lastKnown) {
      // Restrict to transactions that happened AFTER the last known balance.
      const startMoment = protoDateToMoment(lastKnown.date);
      dataSinceKnown = txDatas
        .filter(data => timestampToMoment(data.date).isAfter(startMoment, 'day'));
    } else {
      dataSinceKnown = txDatas;
    }
    const startBalance = lastKnown ? moneyToNumber(lastKnown.balance) : 0;
    const balance = dataSinceKnown.reduce(
      (acc, data) => acc + moneyToNumber(data.amount), startBalance);

    let altBalance: number | null = null;
    if (account.currency !== this.dataService.getMainCurrency()) {
      altBalance = this.currencyService.convertAmount(
        balance, account.currency, this.dataService.getMainCurrency());
    }

    return {
      balance,
      altBalance,
      lastTransactionMoment: lastTransaction ? timestampToMoment(lastTransaction.date) : null,
      lastKnownBalanceMoment: lastKnown ? protoDateToMoment(lastKnown.date) : null,
      numTransactionsSinceLastKnown: dataSinceKnown.length,
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
