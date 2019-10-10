import { ComponentType } from '@angular/cdk/portal';
import { Injectable } from '@angular/core';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { Account, ProcessingRule, Transaction, TransactionData } from '../../proto/model';
import { AccountEditComponent, AccountEditConfig } from './accounts/account-edit/account-edit.component';
import { BalancesComponent } from './accounts/balances/balances.component';
import { DialogLabelDominanceComponent, LabelDominanceOrder } from './analytics/dialog-label-dominance/dialog-label-dominance.component';
import { DialogStaleDataComponent } from './dialog-stale-data/dialog-stale-data.component';
import { ImportDialogData, ImportFileComponent, ImportFileEncoding } from './import/import-file.component';
import { RuleEditComponent, RuleEditConfig } from './rules/rule-edit/rule-edit.component';
import { DialogDeleteWithOrphansComponent } from './transactions/dialog-delete-with-orphans/dialog-delete-with-orphans.component';
import { DialogSplitTransactionComponent } from './transactions/dialog-split-transaction/dialog-split-transaction.component';
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

  openStaleData(): ConfirmableDialogRef<DialogStaleDataComponent> {
    return this.openConfirmable(DialogStaleDataComponent);
  }

  openAccountImport(
    account: Account | null,
    file?: File,
    forcedEncoding?: ImportFileEncoding
  ): ConfirmableDialogRef<ImportFileComponent> {
    return this.openConfirmable(ImportFileComponent, {
      data: <ImportDialogData>{ account, file, forcedEncoding },
    });
  }

  openAccountEdit(account: Account, editMode: 'add' | 'edit')
    : ConfirmableDialogRef<AccountEditComponent> {
    const config: AccountEditConfig = { account, editMode };
    return this.openConfirmable(AccountEditComponent, { data: config });
  }

  openBalances(account: Account): MatDialogRef<BalancesComponent> {
    return this.matDialog.open(BalancesComponent, {
      data: { account },
    });
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

  openRuleEdit(rule: ProcessingRule, editMode: 'add' | 'edit')
    : ConfirmableDialogRef<RuleEditComponent> {
    const config: RuleEditConfig = { rule, editMode };
    return this.openConfirmable(RuleEditComponent, { data: config });
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
