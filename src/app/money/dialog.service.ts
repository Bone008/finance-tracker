import { ComponentType } from '@angular/cdk/portal';
import { Injectable } from '@angular/core';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { Transaction, TransactionData } from '../../proto/model';
import { DialogLabelDominanceComponent, LabelDominanceOrder } from './analytics/dialog-label-dominance/dialog-label-dominance.component';
import { DialogSettingsComponent } from './dialog-settings/dialog-settings.component';
import { DialogStaleDataComponent } from './dialog-stale-data/dialog-stale-data.component';
import { StorageSettings } from './storage-settings.service';
import { DialogDeleteWithOrphansComponent } from './transactions/dialog-delete-with-orphans/dialog-delete-with-orphans.component';
import { DialogSplitTransactionComponent } from './transactions/dialog-split-transaction/dialog-split-transaction.component';
import { FormImportComponent } from './transactions/form-import/form-import.component';
import { TransactionEditComponent } from './transactions/transaction-edit/transaction-edit.component';

export type ConfirmableDialogRef<T> =
  MatDialogRef<T, boolean> & {
    /** Gets an observable that is notified when the dialog was confirmed. */
    afterConfirmed: () => Observable<void>

    /** Gets an observable that is notified when the dialog was cancelled. */
    afterCancelled: () => Observable<void>
  };

/**
 * Specialized wrapper around MatDialog functionality
 * that allows opening specific dialogs.
 */
@Injectable({
  providedIn: 'root'
})
export class DialogService {

  constructor(private readonly matDialog: MatDialog) { }

  openSettings(storageSettings: StorageSettings): ConfirmableDialogRef<DialogSettingsComponent> {
    return this.openConfirmable(DialogSettingsComponent, {
      data: { storageSettings },
    });
  }

  openStaleData(): ConfirmableDialogRef<DialogStaleDataComponent> {
    return this.openConfirmable(DialogStaleDataComponent);
  }

  openFormImport(): ConfirmableDialogRef<FormImportComponent> {
    return this.openConfirmable(FormImportComponent);
  }

  openTransactionEdit(transaction: Transaction, editMode: typeof TransactionEditComponent.prototype.editMode)
    : ConfirmableDialogRef<TransactionEditComponent> {
    return this.openConfirmable(TransactionEditComponent, {
      data: { transaction, editMode },
    });
  }

  openTransactionSplit(transactionData: TransactionData)
    : ConfirmableDialogRef<DialogSplitTransactionComponent> {
    return this.openConfirmable(DialogSplitTransactionComponent, {
      data: { transactionData },
    });
  }

  openConfirmDeleteWithOrphans(numTransactions: number, numOrphans: number)
    : MatDialogRef<DialogDeleteWithOrphansComponent, 'keep' | 'delete'> {
    return this.matDialog.open(DialogDeleteWithOrphansComponent, {
      data: { numTransactions, numOrphans },
    });
  }

  openAnalyticsLabelDominance(dominanceOrder: LabelDominanceOrder)
    : ConfirmableDialogRef<DialogLabelDominanceComponent> {
    return this.openConfirmable(DialogLabelDominanceComponent, {
      data: { dominanceOrder },
    });
  }

  /**
   * Should be used for dialogs with a boolean result.
   * Augments the return value with Observables that are only invoked for the
   * success or cancel cases, respectively.
   */
  private openConfirmable<T, D = any>(
    component: ComponentType<T>, config?: MatDialogConfig<D>)
    : ConfirmableDialogRef<T> {
    const dialogRef = this.matDialog.open(component, config) as ConfirmableDialogRef<T>;

    dialogRef.afterConfirmed =
      () => this.afterFilteredCloseImpl(dialogRef, value => value === true);
    dialogRef.afterCancelled =
      () => this.afterFilteredCloseImpl(dialogRef, value => value !== true);

    return dialogRef;
  }

  private afterFilteredCloseImpl<T>(
    dialogRef: MatDialogRef<T, boolean>,
    predicate: (value: boolean | undefined) => boolean
  ): Observable<void> {
    return dialogRef.afterClosed()
      .pipe(filter(predicate))
      .pipe(map(value => { }));
  }
}
