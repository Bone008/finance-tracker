import { Injectable } from '@angular/core';
import * as moment from 'moment';
import { ProcessingAction, ProcessingTrigger, Transaction, TransactionData } from '../../proto/model';
import { LoggerService } from '../core/logger.service';
import { momentToTimestamp, numberToMoney } from '../core/proto-util';
import { DataService } from './data.service';
import { addLabelToTransaction, isSingle, removeLabelFromTransaction } from './model-util';
import { TransactionFilterService } from './transaction-filter.service';

/** Represents all strings that can be changed through the setField action. */
export type SettableField = keyof Pick<TransactionData, (
  'amount' | 'bookingText' | 'comment' | 'date' | 'reason' | 'who' | 'whoIdentifier'
)>;
const SETTABLE_FIELDS: SettableField[] = [
  'amount', 'bookingText', 'comment', 'date', 'reason', 'who', 'whoIdentifier'
];
/** Checks if a string is a valid settable field. */
export function isSettableField(value: string): value is SettableField {
  return SETTABLE_FIELDS.includes(<any>value);
}

/**
 * Manages automatic processing rules for transactions.
 */
@Injectable({
  providedIn: 'root'
})
export class RuleService {
  constructor(
    private readonly dataService: DataService,
    private readonly filterService: TransactionFilterService,
    private readonly logger: LoggerService) { }

  patchRulesForLabelRename(oldLabelName: string, newLabelName: string) {
    for (const rule of this.dataService.getCurrentProcessingRules()) {
      // Note: We can only patch actions, not stored filters. The user has to
      // adjust those manually if desired.
      for (const action of rule.actions) {
        if (action.addLabel === oldLabelName) {
          action.addLabel = newLabelName;
        }
        if (action.removeLabel === oldLabelName) {
          action.removeLabel = newLabelName;
        }
      }
    }
  }

  notifyAdded(transaction: Transaction) {
    this.applyRulesWithTrigger([transaction], ProcessingTrigger.ADDED, 'ADDED');
  }

  notifyImported(transactions: Transaction[]) {
    this.applyRulesWithTrigger(transactions, ProcessingTrigger.IMPORTED, 'IMPORTED');
  }

  notifyModified(transactions: Transaction[]) {
    this.applyRulesWithTrigger(transactions, ProcessingTrigger.MODIFIED, 'MODIFIED');
  }

  private applyRulesWithTrigger(transactions: Transaction[], trigger: ProcessingTrigger, triggerName: string) {
    const triggeredRules = this.dataService.getCurrentProcessingRules()
      .filter(rule => rule.triggers.includes(trigger));

    let numAffected = 0;
    for (const transaction of transactions) {
      for (const rule of triggeredRules) {
        if (!this.filterService.matchesFilter(transaction, rule.filter)) {
          continue;
        }

        let anyAffected = false;
        for (const action of rule.actions) {
          anyAffected = this.applyAction(transaction, action) || anyAffected;
        }
        if (anyAffected) {
          numAffected++;
        }
        if (rule.isLast) {
          break;
        }
      }
    }
    this.logger.debug(`Executed ${triggeredRules.length} rules on ${triggerName}. `
      + `${numAffected} of ${transactions.length} transactions affected.`);
  }

  /** Applies a single action on a single transaction. Returns true if the transaction was modified. */
  private applyAction(transaction: Transaction, action: ProcessingAction): boolean {
    switch (action.type) {
      case 'addLabel':
        return addLabelToTransaction(transaction, this.evaluateActionValue(action.addLabel));

      case 'removeLabel':
        return removeLabelFromTransaction(transaction, this.evaluateActionValue(action.removeLabel));

      case 'setField':
        if (!isSingle(transaction)) {
          this.logger.warn('Cannot apply setField action to group transaction!', transaction.toJSON());
          return false;
        }
        const field = action.setField!.fieldName;
        if (!isSettableField(field)) {
          this.logger.warn('Cannot apply setField action to invalid field:', field);
          return false;
        }
        const resolvedValue = this.evaluateActionValue(action.setField!.value);

        if (field === 'date') {
          // See https://momentjs.com/docs/#/parsing/string/
          // for how this constructor treats different formats.
          const m = moment(resolvedValue, moment.ISO_8601);
          if (!m.isValid()) {
            this.logger.warn('Date has to be ISO 8601 formatted in setField:', resolvedValue, transaction.toJSON());
            return false;
          }

          transaction.single.date = momentToTimestamp(m);
          return true;
        }
        else if (field === 'amount') {
          const num = Number(resolvedValue);
          if (isNaN(num)) {
            this.logger.warn('Not a valid amount in setField:', resolvedValue, transaction.toJSON());
            return false;
          }
          transaction.single.amount = numberToMoney(num);
          return true;
        }
        else {
          transaction.single[field] = resolvedValue;
          return true;
        }

      default:
        this.logger.warn('Cannot process unknown rule action type:', action.type);
        return false;
    }
  }

  private evaluateActionValue(value: string): string {
    // TODO: missing context parameter, no mechanism yet
    return value;
  }
}
