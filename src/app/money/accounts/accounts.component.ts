import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { cloneMessage, moneyToNumber, protoDateToMoment } from 'src/app/core/proto-util';
import { maxBy } from 'src/app/core/util';
import { Account, KnownBalance } from 'src/proto/model';
import { CurrencyService } from '../currency.service';
import { DataService } from '../data.service';
import { DialogService } from '../dialog.service';
import { extractTransactionData } from '../model-util';

@Component({
  selector: 'app-accounts',
  templateUrl: './accounts.component.html',
  styleUrls: ['./accounts.component.css']
})
export class AccountsComponent implements OnInit {
  readonly accounts$: Observable<Account[]>;

  private cachedBalances: number[] = [];

  constructor(
    private readonly dataService: DataService,
    private readonly currencyService: CurrencyService,
    private readonly dialogService: DialogService,
  ) {
    this.accounts$ = this.dataService.accounts$.pipe(
      tap(accounts => {
        for (const account of accounts) {
          this.cachedBalances[account.id] = this.computeAccountBalance(account);
        }
      })
    );
  }

  ngOnInit() {
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
      });
  }

  delete(account: Account) {
    // TODO: check for references
    this.dataService.removeAccounts(account);
  }


  getCurrencySymbol(currencyCode: string): string {
    return this.currencyService.getSymbol(currencyCode);
  }

  getBalance(account: Account): number {
    return this.cachedBalances[account.id] || 0;
  }

  formatBalance(account: Account): string {
    return this.currencyService.format(this.getBalance(account), account.currency);
  }

  getLastKnownBalanceDate(account: Account): Date | null {
    const lastBalance = this.getLastKnownBalance(account);
    return lastBalance ? protoDateToMoment(lastBalance.date).toDate() : null;
  }

  private getLastKnownBalance(account: Account): KnownBalance | null {
    return maxBy(account.knownBalances, known => protoDateToMoment(known.date).valueOf());
  }

  private computeAccountBalance(account: Account): number {
    const known = this.getLastKnownBalance(account) || new KnownBalance();
    const startBalance = moneyToNumber(known.balance);

    return extractTransactionData(this.dataService.getCurrentTransactionList())
      .filter(data => data.accountId === account.id)
      .reduce((acc, data) => acc + moneyToNumber(data.amount), startBalance);
  }
}
