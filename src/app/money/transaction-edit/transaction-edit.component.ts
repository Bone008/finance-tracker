import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { Money, Transaction, TransactionData } from '../../../proto/model';
import { dateToTimestamp, moneyToNumber, numberToMoney, timestampToDate } from '../../core/proto-util';

export const MODE_ADD = 'add';
export const MODE_EDIT = 'edit';

@Component({
  selector: 'app-transaction-edit',
  templateUrl: './transaction-edit.component.html',
  styleUrls: ['./transaction-edit.component.css']
})
export class TransactionEditComponent implements OnInit {
  transaction: Transaction;
  /** the value of transaction.single for easier access */
  singleData: TransactionData;
  editMode: typeof MODE_ADD | typeof MODE_EDIT;

  private _isNegative: boolean;
  get isNegative(): boolean { return this._isNegative; }
  set isNegative(value: boolean) {
    this._isNegative = value;
    // Update sign on change.
    this.setAmount(moneyToNumber(this.singleData.amount));
  }

  constructor(
    @Inject(MAT_DIALOG_DATA) data: { transaction: Transaction, editMode: typeof MODE_ADD | typeof MODE_EDIT },
    private readonly matDialogRef: MatDialogRef<TransactionEditComponent>,
  ) {
    if (data.transaction.dataType !== "single") {
      throw new Error("cannot edit group transactions yet");
    }

    this.transaction = data.transaction;
    this.singleData = data.transaction.single!;
    this.editMode = data.editMode;

    if (!this.singleData.amount) {
      this.singleData.amount = new Money();
    }

    this._isNegative = moneyToNumber(this.singleData.amount) <= 0;
  }

  ngOnInit() {
  }

  setDate(dateString: string) {
    if (dateString) {
      this.singleData.date = dateToTimestamp(new Date(dateString));
    }
  }

  getDate(): Date {
    return timestampToDate(this.singleData.date);
  }

  setAmount(amount: number | null) {
    if (amount) {
      // Sign always matching form selection, round to 2 digits.
      const amountSign = (this.isNegative ? -1 : 1);
      const newAmount = numberToMoney(amountSign * Math.abs(amount));
      this.singleData.amount!.units = newAmount.units;
      this.singleData.amount!.subunits = newAmount.subunits;
    } else {
      // Treat all falsy values as zero.
      this.singleData.amount!.units = 0;
      this.singleData.amount!.subunits = 0;
    }
  }

  getAbsoluteAmount(): number {
    return Math.abs(moneyToNumber(this.singleData.amount));
  }

  addLabel(newLabel: string) {
    if (this.transaction.labels.indexOf(newLabel) === -1) {
      this.transaction.labels.push(newLabel);
    }
  }

  deleteLabel(label: string) {
    const index = this.transaction.labels.indexOf(label);
    if (index !== -1) {
      this.transaction.labels.splice(index, 1);
    }
  }

  getDateCreated(): Date {
    return timestampToDate(this.singleData.created);
  }

  getDateModified(): Date | null {
    return this.singleData.modified ? timestampToDate(this.singleData.modified) : null;
  }

  onSubmit() {
    console.log(this.transaction);
    this.matDialogRef.close(true);
  }

}
