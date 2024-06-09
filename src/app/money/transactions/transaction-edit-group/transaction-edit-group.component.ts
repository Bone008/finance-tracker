import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { millisecondsToTimestamp, timestampToDate, timestampToMilliseconds } from 'src/app/core/proto-util';
import { pushDeduplicate } from 'src/app/core/util';
import { BillingInfo, GroupData, Transaction } from 'src/proto/model';
import { getTransactionTimestamp, isGroup } from '../../model-util';

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

    // Dropdown options for the date selector.
    // Note that we do NOT want the dropdown's ngModel to access children directly,
    // since the data model may contain arbitrary dates that do not need to match
    // the dropdown's options (so the lookup "locate child by timestamp" is necessary
    // SOMEWHERE anyway).
    this.childrenDates = this.groupData.children.map(child => timestampToDate(child.date));
  }

  getProperDateMillis(): number {
    return timestampToMilliseconds(getTransactionTimestamp(this.transaction));
  }

  setProperDateMillis(millis: number) {
    this.groupData.properDate = millis !== 0 ? millisecondsToTimestamp(millis) : null;

    // Temporary: Try to detect if realDate is set on the selected child.
    const child = this.groupData.children.find(child => timestampToMilliseconds(child.date) === millis);
    if (child && child.realDate) {
      this.groupData.properRealDate = child.realDate;
    } else {
      // Important: Reset if it is not.
      this.groupData.properRealDate = null;
    }
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
