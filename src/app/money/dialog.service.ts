import { Injectable } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material';
import { FormImportComponent } from './form-import/form-import.component';
import { TransactionEditComponent } from './transaction-edit/transaction-edit.component';
import { Transaction } from '../../proto/model';
import { DialogDeleteWithOrphansComponent } from './dialog-delete-with-orphans/dialog-delete-with-orphans.component';

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

  openConfirmDeleteWithOrphans(numTransactions: number, numOrphans: number)
    : MatDialogRef<DialogDeleteWithOrphansComponent, 'keep'|'delete'> {
    return this.dialogService.open(DialogDeleteWithOrphansComponent, {
      data: { numTransactions, numOrphans },
    });
  }
}
