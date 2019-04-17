import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material';
import * as moment from 'moment';
import { momentToProtoDate, moneyToNumber, numberToMoney, protoDateToMoment } from 'src/app/core/proto-util';
import { removeByValue } from 'src/app/core/util';
import { Account, Date as ProtoDate, KnownBalance } from 'src/proto/model';
import { isNumber } from 'util';
import { CurrencyService } from '../../currency.service';

interface DisplayedBalance {
  original: KnownBalance;
  date: Date;
  isNegative: boolean;
  formattedBalance: string;
}

@Component({
  selector: 'app-balances',
  templateUrl: './balances.component.html',
  styleUrls: ['./balances.component.css']
})
export class BalancesComponent implements OnInit {
  readonly account: Account;
  displayedBalances: DisplayedBalance[] = [];

  newDate: Date | null = new Date();
  newBalance: number | null = null;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: { account: Account },
    private readonly currencyService: CurrencyService,
  ) {
    this.account = data.account;
    this.computeDisplayedBalances();
  }

  ngOnInit() {
  }

  addNew() {
    // Note that the type assertion is needed because for some reason, the type narrowing does not
    // work within the Angular compilation.
    if (!isNumber(this.newBalance) || !isFinite(this.newBalance!) || !this.newDate) {
      return;
    }

    const protoDate = momentToProtoDate(moment(this.newDate));
    if (this.hasBalanceAtDate(protoDate)) {
      return;
    }

    this.account.knownBalances.push(new KnownBalance({
      date: protoDate,
      balance: numberToMoney(this.newBalance!),
    }));
    this.newDate = null;
    this.newBalance = null;
    this.computeDisplayedBalances();
  }

  delete(balance: KnownBalance) {
    removeByValue(this.account.knownBalances, balance);
    this.computeDisplayedBalances();
  }

  getCurrencySymbol(): string {
    return this.currencyService.getSymbol(this.account.currency);
  }

  private hasBalanceAtDate(protoDate: ProtoDate): boolean {
    return this.account.knownBalances.some(balance =>
      !!balance.date
      && balance.date.year === protoDate.year
      && balance.date.month === protoDate.month
      && balance.date.day === protoDate.day
    );
  }

  private computeDisplayedBalances() {
    this.displayedBalances = this.account.knownBalances
      .map(balance => ({
        original: balance,
        date: protoDateToMoment(balance.date).toDate(),
        isNegative: moneyToNumber(balance.balance) < 0,
        formattedBalance: this.currencyService.format(balance.balance, this.account.currency),
      }))
      // Sort descending by date.
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }
}
