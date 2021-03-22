import { Component, DoCheck, Input } from '@angular/core';
import { moneyToNumber } from 'src/app/core/proto-util';
import { CacheCountable, CacheCountChecker } from 'src/app/core/view-cache-util';
import { Transaction, TransactionData } from 'src/proto/model';
import { extractTransactionData, isGroup } from '../../model-util';

/**
 * Renders a summary textual description of a transaction (or just a single
 * TransactionData).
 */
@Component({
  selector: 'app-transaction-notes',
  templateUrl: './transaction-notes.component.html',
  styleUrls: ['./transaction-notes.component.css']
})
export class TransactionNotesComponent implements DoCheck {
  @Input() transaction: (Transaction & CacheCountable) | undefined;
  @Input() transactionData: (TransactionData & CacheCountable) | undefined;

  noteLines: [string, string][] = [];

  private readonly checker = new CacheCountChecker(this.refresh.bind(this));

  ngDoCheck() {
    this.checker.check(this.transaction || this.transactionData);
  }

  private refresh() {
    this.noteLines = [];

    if (this.transaction) {
      const isAGroup = isGroup(this.transaction);
      this.noteLines = extractTransactionData(this.transaction)
        .map(data => this.formatData(data, isAGroup));

      if (isAGroup) {
        this.noteLines.push(['', this.transaction.group!.comment]);
      }
    }
    else if (this.transactionData) {
      this.noteLines = [this.formatData(this.transactionData, false)];
    }
  }

  private formatData(data: TransactionData, withSign: boolean): [string, string] {
    const signStr = withSign
      ? `(${this.getSignString(moneyToNumber(data.amount))}) `
      : '';
    return [
      signStr + [data.who, data.reason].filter(value => !!value).join(", "),
      data.comment,
    ];
  }

  private getSignString(num: number): string {
    if (num > 0) return '+';
    if (num < 0) return '\u2013'; // ndash
    return '0';
  }

}
