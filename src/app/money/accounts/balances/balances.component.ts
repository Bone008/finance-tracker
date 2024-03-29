import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import * as moment from 'moment';
import { cloneMessage, momentToProtoDate, momentToTimestamp, moneyToNumber, numberToMoney, protoDateToMoment, timestampNow, timestampToMoment } from 'src/app/core/proto-util';
import { maxBy, removeByValue } from 'src/app/core/util';
import { Account, BillingInfo, BillingType, Date as ProtoDate, KnownBalance, Transaction, TransactionData } from 'src/proto/model';
import { CurrencyService } from '../../currency.service';
import { DataService } from '../../data.service';
import { DialogService } from '../../dialog.service';
import { extractTransactionData, MONEY_EPSILON } from '../../model-util';
import { RuleService } from '../../rule.service';

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
    private readonly ruleService: RuleService,
    private readonly dialogService: DialogService,
  ) {
    this.account = data.account;
    this.computeDisplayedBalances();
  }

  ngOnInit() {
  }

  addNew() {
    if (typeof this.newBalance !== 'number' || !isFinite(this.newBalance) || !this.newDate) {
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

  fixDiscrepancy(displayedBalance: DisplayedBalance) {
    const balance = displayedBalance.original;
    const [discrepancy, previous] = this.computeDiscrepancy(balance);
    if (!discrepancy || !previous) {
      throw new Error('Tried to fix invalid discrepancy.');
    }

    const transaction = new Transaction({
      billing: new BillingInfo({
        periodType: BillingType.DAY,
        date: momentToProtoDate(protoDateToMoment(previous.date).add(1, 'day')),
        endDate: cloneMessage(ProtoDate, balance.date),
      }),
      single: new TransactionData({
        accountId: this.account.id,
        date: momentToTimestamp(protoDateToMoment(balance.date)),
        realDate: cloneMessage(ProtoDate, balance.date),
        amount: numberToMoney(discrepancy),
        reason: 'untracked',
      }),
    });

    this.dialogService.openTransactionEdit(transaction, 'add')
      .afterConfirmed().subscribe(() => {
        transaction.single!.created = timestampNow();
        this.dataService.addTransactions(transaction);
        this.ruleService.notifyAdded(transaction);
        this.computeDisplayedBalances();
      });
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
        const [discrepancy, _] = this.computeDiscrepancy(balance);
        return <DisplayedBalance>{
          original: balance,
          date: protoDateToMoment(balance.date).toDate(),
          isNegative: moneyToNumber(balance.balance) < -MONEY_EPSILON,
          formattedBalance: this.currencyService.format(balance.balance, this.account.currency),
          hasDiscrepancy: discrepancy && Math.abs(discrepancy) >= MONEY_EPSILON,
          isDiscrepancyNegative: discrepancy && discrepancy < -MONEY_EPSILON,
          formattedDiscrepancy: discrepancy && this.currencyService.format(discrepancy, this.account.currency, true),
        };
      })
      // Sort descending by date.
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  /**
   * Computes a known balance's discrepancy to its closest predecessor.
   * @returns null if no predecessor exists, otherwise the discrepancy + which predecessor was found.
   */
  private computeDiscrepancy(balance: KnownBalance): [number | null, KnownBalance | null] {
    const when = protoDateToMoment(balance.date);
    const allPrevious = this.account.knownBalances
      .map(knownBalance => ({ knownBalance, otherMoment: protoDateToMoment(knownBalance.date) }))
      .filter(({ otherMoment }) => otherMoment.isBefore(when, 'day'));
    const previous = maxBy(allPrevious, ({ otherMoment }) => otherMoment.valueOf());

    if (!previous) {
      return [null, null];
    }

    const computedBalance = this.computeAccountBalance(previous.knownBalance, when);
    const givenBalance = moneyToNumber(balance.balance);
    return [givenBalance - computedBalance, previous.knownBalance];
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
