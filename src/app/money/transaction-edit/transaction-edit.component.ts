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

  onSubmit() {
    this.matDialogRef.close(true);
  }

}
