import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { timestampToDate } from 'src/app/core/proto-util';
import { pushDeduplicate } from 'src/app/core/util';
import { BillingInfo, GroupData, Transaction } from 'src/proto/model';
import { isGroup } from '../../model-util';

export interface TransactionEditGroupConfig {
  transaction: Transaction;
}

@Component({
  selector: 'app-transaction-edit-group',
  templateUrl: './transaction-edit-group.component.html',
  styleUrls: ['./transaction-edit-group.component.scss']
})
export class TransactionEditGroupComponent {

  transaction: Transaction;
  groupData: GroupData;

  /** Converted dates */
  childrenDates: Date[];

  constructor(
    @Inject(MAT_DIALOG_DATA) data: TransactionEditGroupConfig,
    private readonly matDialogRef: MatDialogRef<TransactionEditGroupComponent>,
  ) {
    if (!isGroup(data.transaction)) {
      throw new Error('Cannot open group edit dialog for non-group transaction.');
    }
    this.transaction = data.transaction;
    this.groupData = data.transaction.group;

    if (!this.transaction.billing) {
      this.transaction.billing = new BillingInfo();
    }

    this.childrenDates = this.groupData.children.map(child => timestampToDate(child.date));
  }

  // Copied from TransactionEditComponent.
  addLabel(newLabel: string) {
    pushDeduplicate(this.transaction.labels, newLabel);
  }

  // Copied from TransactionEditComponent.
  deleteLabel(label: string) {
    const index = this.transaction.labels.indexOf(label);
    if (index !== -1) {
      this.transaction.labels.splice(index, 1);
    }
  }

  onSubmit() {
    this.matDialogRef.close(true);
  }

}
