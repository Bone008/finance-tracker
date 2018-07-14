import { Injectable } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material';
import { Transaction, TransactionData } from '../../proto/model';
import { DialogDeleteWithOrphansComponent } from './dialog-delete-with-orphans/dialog-delete-with-orphans.component';
import { DialogSplitTransactionComponent } from './dialog-split-transaction/dialog-split-transaction.component';
import { FormImportComponent } from './form-import/form-import.component';
import { TransactionEditComponent } from './transaction-edit/transaction-edit.component';

/**
 * Specialized wrapper around MatDialog functionality
 * that allows opening specific dialogs.
 */
@Injectable({
  providedIn: 'root'
})
export class DialogService {

  constructor(private readonly dialogService: MatDialog) { }

  openFormImport(): MatDialogRef<FormImportComponent, boolean> {
    return this.dialogService.open(FormImportComponent);
  }

  openTransactionEdit(transaction: Transaction, editMode: typeof TransactionEditComponent.prototype.editMode)
    : MatDialogRef<TransactionEditComponent, boolean> {
    return this.dialogService.open(TransactionEditComponent, {
      data: { transaction, editMode },
    });
  }

  openTransactionSplit(transactionData: TransactionData)
    : MatDialogRef<DialogSplitTransactionComponent, boolean> {
    return this.dialogService.open(DialogSplitTransactionComponent, {
      data: { transactionData },
    });
  }

  openConfirmDeleteWithOrphans(numTransactions: number, numOrphans: number)
    : MatDialogRef<DialogDeleteWithOrphansComponent, 'keep' | 'delete'> {
    return this.dialogService.open(DialogDeleteWithOrphansComponent, {
      data: { numTransactions, numOrphans },
    });
  }
}
