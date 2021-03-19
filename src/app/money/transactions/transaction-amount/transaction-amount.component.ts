import { Component, DoCheck, Input } from '@angular/core';
import { moneyToNumber } from 'src/app/core/proto-util';
import { CacheCountable, CacheCountChecker } from 'src/app/core/view-cache-util';
import { Transaction, TransactionData } from 'src/proto/model';
import { CurrencyService } from '../../currency.service';
import { DataService } from '../../data.service';
import { getTransactionAmount, getTransactionDataCurrency, getTransactionUniqueAccount, getTransactionUniqueCurrency, isGroup, MONEY_EPSILON } from '../../model-util';

interface AmountInfo {
  accountName: string;
  accountIcon: string;
  formattedAmount: string;
  formattedAmountAlt: string | null;
  isNegative: boolean;
}

/**
 * Displays a formatted amount of either a whole transaction or a single TransactionData,
 * while respecting transfers.
 */
@Component({
  selector: 'app-transaction-amount',
  templateUrl: './transaction-amount.component.html',
  styleUrls: ['./transaction-amount.component.css']
})
export class TransactionAmountComponent implements DoCheck {
  @Input() transaction: (Transaction & CacheCountable) | undefined;
  @Input() transactionData: (TransactionData & CacheCountable) | undefined;

  /** If showing a transfer, holds the negative half of it. Otherwise just the amount to show. */
  amount1: AmountInfo;
  /** Non-null if showing a transfer and always holds the positive half of it. */
  amount2: AmountInfo | null;
  isCrossCurrencyTransfer: boolean;
  get isTransfer(): boolean { return !!this.amount2; }

  private readonly checker = new CacheCountChecker(this.refresh.bind(this));

  constructor(
    private readonly currencyService: CurrencyService,
    private readonly dataService: DataService,
  ) { }

  ngDoCheck() {
    this.checker.check(this.transaction || this.transactionData);
  }

  private refresh() {
    if (this.transaction) {
      const transfer = this.extractTransferInfo(this.transaction);
      if (transfer) {
        this.amount1 = this.formatDataInfo(transfer.from);
        this.amount2 = this.formatDataInfo(transfer.to);
        this.isCrossCurrencyTransfer =
          getTransactionDataCurrency(transfer.from, this.dataService)
          !== getTransactionDataCurrency(transfer.to, this.dataService);
      }
      else {
        this.amount1 = this.formatFullTransaction(this.transaction);
        this.amount2 = null;
        this.isCrossCurrencyTransfer = false;
      }
    }
    else {
      const data = this.transactionData || new TransactionData();
      this.amount1 = this.formatDataInfo(data);
      this.amount2 = null;
      this.isCrossCurrencyTransfer = false;
    }
  }

  /** Formats a non-transfer transaction. */
  private formatFullTransaction(transaction: Transaction): AmountInfo {
    let altText: string | null = null;
    let displayedCurrency = getTransactionUniqueCurrency(transaction, this.dataService);
    if (displayedCurrency === null) {
      displayedCurrency = this.dataService.getMainCurrency();
      altText = 'group of different currencies';
    }

    const amount = getTransactionAmount(transaction, this.dataService, this.currencyService, displayedCurrency);
    if (displayedCurrency !== this.dataService.getMainCurrency()) {
      const amountInMainCurrency = getTransactionAmount(transaction, this.dataService, this.currencyService);
      altText = this.currencyService.format(amountInMainCurrency, this.dataService.getMainCurrency());
    }

    const uniqueAccount = getTransactionUniqueAccount(transaction, this.dataService);
    return {
      accountIcon: uniqueAccount ? uniqueAccount.icon : 'list',
      accountName: uniqueAccount ? uniqueAccount.name : 'group of different accounts',
      formattedAmount: this.currencyService.format(amount, displayedCurrency),
      formattedAmountAlt: altText,
      isNegative: amount < -MONEY_EPSILON,
    };
  }

  /** Formats a single transaction data value. */
  private formatDataInfo(data: TransactionData): AmountInfo {
    const account = this.dataService.getAccountById(data.accountId);
    const mainCurrency = this.dataService.getMainCurrency();

    const nativeAmount = moneyToNumber(data.amount);
    const amountInMainCurrency = this.currencyService.convertAmount(
      nativeAmount, account.currency, this.dataService.getMainCurrency());

    return {
      accountIcon: account.icon,
      accountName: account.name,
      formattedAmount: this.currencyService.format(nativeAmount, account.currency),
      formattedAmountAlt: account.currency !== mainCurrency
        ? this.currencyService.format(amountInMainCurrency, mainCurrency) : null,
      isNegative: nativeAmount < -MONEY_EPSILON,
    };
  }

  private extractTransferInfo(transaction: Transaction): { from: TransactionData, to: TransactionData } | null {
    // Only allow groups with exactly 2 children ...
    if (!isGroup(transaction) || transaction.group.children.length !== 2
      // ... with different accounts
      || transaction.group.children[0].accountId === transaction.group.children[1].accountId
      // ... with a total amount of 0.
      || Math.abs(getTransactionAmount(transaction, this.dataService, this.currencyService)) >= MONEY_EPSILON) {
      return null;
    }

    const amounts = transaction.group.children.map(child => moneyToNumber(child.amount));
    if (Math.sign(amounts[0]) === Math.sign(amounts[1])) {
      // No opposing signs.
      return null;
    }
    const fromIndex = amounts[0] < 0 ? 0 : 1;
    return {
      from: transaction.group.children[fromIndex],
      to: transaction.group.children[1 - fromIndex],
    };
  }
}
