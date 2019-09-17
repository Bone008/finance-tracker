import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { TransactionData } from '../../../../proto/model';
import { moneyToNumber, numberToMoney } from '../../../core/proto-util';
import { CurrencyService } from '../../currency.service';
import { DataService } from '../../data.service';
import { getTransactionDataCurrency } from '../../model-util';

@Component({
  selector: 'app-dialog-split-transaction',
  templateUrl: './dialog-split-transaction.component.html',
  styleUrls: ['./dialog-split-transaction.component.css']
})
export class DialogSplitTransactionComponent implements OnInit {
  splitAmount = 0;
  readonly currencySymbol: string;

  private readonly transactionData: TransactionData;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: { transactionData: TransactionData },
    dataService: DataService,
    currencyService: CurrencyService,
    private readonly matDialogRef: MatDialogRef<DialogSplitTransactionComponent>
  ) {
    this.transactionData = data.transactionData;

    const currency = getTransactionDataCurrency(this.transactionData, dataService);
    this.currencySymbol = currencyService.getSymbol(currency);
  }

  ngOnInit() {
  }

  getTotalAmount(): number {
    return Math.abs(moneyToNumber(this.transactionData.amount));
  }

  getRemainingAmount(): number {
    return moneyToNumber(numberToMoney(this.getTotalAmount() - this.splitAmount));
  }

  onSubmit() {
    this.matDialogRef.close(true);
  }
}
