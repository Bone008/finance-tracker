import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import * as moment from 'moment';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Account, BillingInfo, Money, Transaction, TransactionData, TransactionPreset } from '../../../../proto/model';
import { momentToProtoDate, momentToTimestamp, moneyToNumber, numberToMoney, timestampToDate } from '../../../core/proto-util';
import { makeSharedDate, pushDeduplicate } from '../../../core/util';
import { CurrencyService } from '../../currency.service';
import { DataService } from '../../data.service';
import { DialogService } from '../../dialog.service';

export const MODE_ADD = 'add';
export const MODE_EDIT = 'edit';
export const MODE_PRESET = 'preset';

export interface TransactionEditConfig {
  transaction: Transaction;
  editMode: typeof MODE_ADD | typeof MODE_EDIT | typeof MODE_PRESET;
  preset?: TransactionPreset;
}

@Component({
  selector: 'app-transaction-edit',
  templateUrl: './transaction-edit.component.html',
  styleUrls: ['./transaction-edit.component.css']
})
export class TransactionEditComponent implements OnInit {
  readonly accountCandidates$: Observable<Account[]>;
  /**
   * If the dialog is opened with a closed account preselected, this contains
   * that account so it can be part of the dropdown.
   */
  readonly closedAccountCandidate: Account | null;

  transaction: Transaction;
  /** the value of transaction.single for easier access */
  singleData: TransactionData;
  presetData: TransactionPreset | null;
  editMode: typeof MODE_ADD | typeof MODE_EDIT | typeof MODE_PRESET;

  private _isNegative: boolean;
  get isNegative(): boolean { return this._isNegative; }
  set isNegative(value: boolean) {
    this._isNegative = value;
    // Update sign on change.
    this.setAmount(moneyToNumber(this.singleData.amount));

    if (this.presetData) {
      this.presetData.amountIsPositive = !value;
    }
  }

  constructor(
    @Inject(MAT_DIALOG_DATA) data: TransactionEditConfig,
    private readonly dataService: DataService,
    private readonly currencyService: CurrencyService,
    private readonly dialogService: DialogService,
    private readonly matDialogRef: MatDialogRef<TransactionEditComponent>,
  ) {
    if (data.transaction.dataType !== "single") {
      throw new Error("cannot edit group transactions yet");
    }
    this.transaction = data.transaction;
    this.singleData = data.transaction.single!;
    this.presetData = data.preset || null;
    this.editMode = data.editMode;

    this.accountCandidates$ = this.dataService.accounts$
      .pipe(map(accounts => accounts.filter(acc => !acc.closed)));
    this.closedAccountCandidate = this.getAccount().closed
      ? this.getAccount() : null;

    if (!this.transaction.billing) {
      this.transaction.billing = new BillingInfo();
    }
    if (!this.singleData.amount) {
      this.singleData.amount = new Money();
    }

    this._isNegative = moneyToNumber(this.singleData.amount) <= 0;
  }

  ngOnInit() {
  }

  getAccount(): Account {
    return this.dataService.getAccountById(this.singleData.accountId);
  }

  isAccountDefault(): boolean {
    return this.singleData.accountId === this.dataService.getUserSettings().defaultAccountIdOnAdd;
  }

  setAccountDefault() {
    this.dataService.getUserSettings().defaultAccountIdOnAdd = this.singleData.accountId;
  }

  setDate(dateString: string) {
    if (dateString) {
      // NOTE: This previously used "new Date(dateString)", which was NOT consistent
      // in terms of returning local/UTC times, see: https://stackoverflow.com/a/5619588
      // Firefox returned UTC midnight, so e.g. "02:00 GMT+0200 (CEST)".
      // This is in contrast to imported CSV rows, which are parsed using moment(),
      // so their times have always resulted in stuff like "00:00 GMT+0200 (CEST)".
      // Now we interpret everything as local time ...
      // Since we also started saving realDate, we should be able to migrate
      // eventually after using and backfilling realDate.
      const newMoment = moment(dateString, 'YYYY-MM-DD', true);
      this.singleData.date = momentToTimestamp(newMoment);
      this.singleData.realDate = momentToProtoDate(newMoment);
    }
  }

  getDate = makeSharedDate(() => {
    if (!this.singleData.date) {
      return null;
    }
    return timestampToDate(this.singleData.date);
  });

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

  getCurrencySymbol(): string {
    return this.currencyService.getSymbol(this.getAccount().currency);
  }

  addLabel(newLabel: string) {
    pushDeduplicate(this.transaction.labels, newLabel);
  }

  deleteLabel(label: string) {
    const index = this.transaction.labels.indexOf(label);
    if (index !== -1) {
      this.transaction.labels.splice(index, 1);
    }
  }

  getDateCreated = makeSharedDate(() => {
    return timestampToDate(this.singleData.created);
  });

  getDateModified = makeSharedDate(() => {
    return this.singleData.modified ? timestampToDate(this.singleData.modified) : null;
  });

  viewImportedRow() {
    console.assert(this.singleData.importedRowId > 0);
    const row = this.dataService.getImportedRowById(this.singleData.importedRowId);
    if (!row) {
      alert('Error: The transaction appears to be linked to a CSV row, but '
        + 'the row cannot be found. This should not happen!');
      return;
    }
    this.dialogService.openViewImportedRow(row);
  }

  onSubmit() {
    this.matDialogRef.close(true);
  }

}
