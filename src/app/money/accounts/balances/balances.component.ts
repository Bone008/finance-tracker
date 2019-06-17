import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material';
import * as moment from 'moment';
import { momentToProtoDate, moneyToNumber, numberToMoney, protoDateToMoment, timestampToMoment } from 'src/app/core/proto-util';
import { maxBy, removeByValue } from 'src/app/core/util';
import { Account, Date as ProtoDate, KnownBalance } from 'src/proto/model';
import { isNumber } from 'util';
import { CurrencyService } from '../../currency.service';
import { DataService } from '../../data.service';
import { extractTransactionData, MONEY_EPSILON } from '../../model-util';

interface DisplayedBalance {
  original: KnownBalance;
  date: Date;
  isNegative: boolean;
  formattedBalance: string;
  hasDiscrepancy: boolean;
  isDiscrepancyNegative: boolean;
  formattedDiscrepancy: string | null;
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
    private readonly dataService: DataService,
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
      .map(balance => {
        const discrepancy = this.computeDiscrepancy(balance);
        return <DisplayedBalance>{
          original: balance,
          date: protoDateToMoment(balance.date).toDate(),
          isNegative: moneyToNumber(balance.balance) < 0,
          formattedBalance: this.currencyService.format(balance.balance, this.account.currency),
          hasDiscrepancy: discrepancy && Math.abs(discrepancy) >= MONEY_EPSILON,
          isDiscrepancyNegative: discrepancy && discrepancy < 0,
          formattedDiscrepancy: discrepancy && this.currencyService.format(discrepancy, this.account.currency, true),
        };
      })
      // Sort descending by date.
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  private computeDiscrepancy(balance: KnownBalance): number | null {
    const when = protoDateToMoment(balance.date);
    const allPrevious = this.account.knownBalances
      .map(knownBalance => ({ knownBalance, otherMoment: protoDateToMoment(knownBalance.date) }))
      .filter(({ otherMoment }) => otherMoment.isBefore(when, 'day'));
    const previous = maxBy(allPrevious, ({ otherMoment }) => otherMoment.valueOf());

    if (!previous) {
      return null;
    }

    const computedBalance = this.computeAccountBalance(previous.knownBalance, when);
    const givenBalance = moneyToNumber(balance.balance);
    return givenBalance - computedBalance;
  }

  // TODO: This is duplicated in AccountsComponent and should be moved to a utility.
  /**
   * Computes an account's balance at the end of a given date based on a given reference balance.
   * The date may be before or after the reference balance's date. Only transactions belonging to
   * the account and which are between the two dates are counted.
   */
  private computeAccountBalance(referenceBalance: KnownBalance, when: moment.Moment): number {
    const account = this.account;

    const referenceMoment = protoDateToMoment(referenceBalance.date);
    const isBackwards = referenceMoment.isAfter(when);
    // Determine time interval. Start is exclusive, end is inclusive (day granularity).
    const startMoment = (isBackwards ? when : referenceMoment);
    const endMoment = (isBackwards ? referenceMoment : when);

    // Calculate sum of matching TransactionData records, in the "forward in time" direction.
    const amountSum = extractTransactionData(this.dataService.getCurrentTransactionList())
      .filter(data => {
        if (data.accountId !== account.id) { return false; }
        const m = timestampToMoment(data.date);
        return m.isAfter(startMoment, 'day') && m.isSameOrBefore(endMoment, 'day');
      })
      .reduce((acc, data) => acc + moneyToNumber(data.amount), 0);

    const startBalance = moneyToNumber(referenceBalance.balance);
    if (isBackwards) {
      return startBalance - amountSum;
    } else {
      return startBalance + amountSum;
    }
  }
}
