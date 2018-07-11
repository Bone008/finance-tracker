import { Component, OnInit, Input, Inject } from '@angular/core';
import { Transaction } from '../transaction.model';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material';

export const MODE_ADD = 'add';
export const MODE_EDIT = 'edit';

@Component({
  selector: 'app-transaction-edit',
  templateUrl: './transaction-edit.component.html',
  styleUrls: ['./transaction-edit.component.css']
})
export class TransactionEditComponent implements OnInit {
  transaction: Transaction;
  editMode: typeof MODE_ADD | typeof MODE_EDIT;

  isNegative = true;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: { transaction: Transaction, editMode: typeof MODE_ADD | typeof MODE_EDIT },
    private readonly matDialogRef: MatDialogRef<TransactionEditComponent>,
  ) {
    this.transaction = data.transaction;
    this.editMode = data.editMode;
  }

  ngOnInit() {
  }

  setDate(dateString: string) {
    if (dateString) {
      this.transaction.date = new Date(dateString);
    }
  }

  setAmount(amount: number|null) {
    console.log(amount, typeof amount, "; old: ", this.transaction.amount);
    if(amount) {
      // Sign always matching form selection, round to 2 digits.
      const amountSign = (this.isNegative ? -1 : 1);
      this.transaction.amount = amountSign * Math.round(Math.abs(amount) * 100) / 100;
    } else {
      // Treat all falsy values as zero.
      this.transaction.amount = 0;
    }
  }

  getAbsoluteAmount(): number {
    return Math.abs(this.transaction.amount);
  }

  onSubmit() {
    this.matDialogRef.close(true);
  }

}
