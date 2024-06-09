import { Component, OnInit, ViewChild } from '@angular/core';
import { MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { cloneMessage, moneyToNumber, numberToMoney, timestampNow, timestampToProtoDate } from 'src/app/core/proto-util';
import { delay } from 'src/app/core/util';
import { Money, Transaction, TransactionData, TransactionPreset } from 'src/proto/model';
import { DataService } from '../../data.service';
import { DialogService } from '../../dialog.service';
import { isSingle, MONEY_EPSILON } from '../../model-util';
import { RuleService } from '../../rule.service';
import { MODE_ADD, MODE_PRESET } from '../transaction-edit/transaction-edit.component';

@Component({
  selector: 'app-presets',
  templateUrl: './presets.component.html',
  styleUrls: ['./presets.component.css']
})
export class PresetsComponent implements OnInit {
  readonly presets$: Observable<TransactionPreset[]>;

  @ViewChild(MatAutocompleteTrigger, { static: true })
  presetsPanelTrigger: MatAutocompleteTrigger;

  constructor(
    private readonly ruleService: RuleService,
    private readonly dataService: DataService,
    private readonly dialogService: DialogService
  ) {
    this.presets$ = this.dataService.transactionPresets$
      .pipe(map(presets => presets.slice().sort((a, b) => a.name.localeCompare(b.name))));
  }

  ngOnInit() {
  }

  startAdd() {
    const preset = new TransactionPreset({
      allowModification: true,
      transaction: new Transaction({
        single: new TransactionData({
          accountId: this.dataService.getUserSettings().defaultAccountIdOnAdd,
        }),
      }),
    });

    this.dialogService.openTransactionEdit(preset.transaction!, MODE_PRESET, preset)
      .afterConfirmed().subscribe(() => {
        preset.created = timestampNow();
        this.dataService.addTransactionPresets(preset);
      });
  }

  startEdit(preset: TransactionPreset) {
    const temp = cloneMessage(TransactionPreset, preset);
    if (!isSingle(temp.transaction!)) {
      throw new Error('Preset contains a non-single transaction.');
    }

    this.patchAmountIfNecessary(preset.amountIsPositive, temp.transaction.single);
    this.dialogService.openTransactionEdit(temp.transaction, MODE_PRESET, temp)
      .afterConfirmed().subscribe(() => {
        // Shallow copy is ok, we can take the entire cloned Transaction message.
        Object.assign(preset, temp);
        preset.modified = timestampNow();
      });
  }

  delete(preset: TransactionPreset) {
    this.dataService.removeTransactionPresets(preset);
  }

  selectPreset(preset: TransactionPreset) {
    if (!preset.transaction) {
      throw new Error('Preset does not contain any transaction data.');
    }

    const transaction = cloneMessage(Transaction, preset.transaction);
    if (!isSingle(transaction)) {
      throw new Error('Preset contains a non-single transaction.');
    }

    transaction.single.date = timestampNow();
    transaction.single.realDate = timestampToProtoDate(transaction.single.date);
    if (preset.allowModification) {
      this.patchAmountIfNecessary(preset.amountIsPositive, transaction.single);
      this.dialogService.openTransactionEdit(transaction, MODE_ADD)
        .afterConfirmed().subscribe(() => this.confirmCreate(preset, transaction));
    }
    else {
      // Validate if stored account still exists.
      const account = this.dataService.getAccountById(transaction.single.accountId);
      if (account.id <= 0) {
        throw new Error('Preset contains non-existing account id: ' + transaction.single.accountId);
      }
      this.confirmCreate(preset, transaction);
    }
  }

  private confirmCreate(preset: TransactionPreset, transaction: Transaction) {
    preset.lastUsed = timestampNow();
    preset.usedCount++;
    // Equivalent to handler in TransactionsComponent#startCopyTransaction.
    transaction.single!.created = timestampNow();
    this.dataService.addTransactions(transaction);
    this.ruleService.notifyAdded(transaction);
  }

  private patchAmountIfNecessary(isPositive: boolean, singleData: TransactionData) {
    if (isPositive && Math.abs(moneyToNumber(singleData.amount)) < MONEY_EPSILON) {
      // Make sure the dialog treats the transaction as an income by temporarily
      // patching the amount to a positive value and then resetting it.
      singleData.amount = numberToMoney(1);
      delay(0).then(() => singleData.amount = new Money());
    }
  }

  async openPresetsPanel() {
    // Delay is necessary since otherwise the button immediately gets back focus
    // and the panel is closed again.
    await delay(0);
    this.presetsPanelTrigger.openPanel();
  }

}
