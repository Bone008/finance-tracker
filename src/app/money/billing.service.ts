import { Injectable } from '@angular/core';
import * as moment from 'moment';
import { BillingInfo, BillingType, Date as ProtoDate, Transaction } from 'src/proto/model';
import { momentToProtoDate, protoDateToMoment, timestampToMoment, timestampToWholeSeconds } from '../core/proto-util';
import { maxBy } from '../core/util';
import { DataService } from './data.service';
import { getDominantLabels, isSingle, isValidBilling } from './model-util';

// (NOTE: Maybe this should be simplified to an independent interface that exposes moments and not dates.)
export type CanonicalBillingInfo = BillingInfo & { isRelative: false, date: Date, endDate: Date };

@Injectable({
  providedIn: 'root'
})
export class BillingService {

  constructor(
    private readonly dataService: DataService
  ) { }

  // Alias for discoverability.
  isValidBilling = isValidBilling;

  /**
   * Returns the canonical billing info that applies to a transaction by resolving
   * inheritance from labels according to the partial dominance order.
   */
  resolveTransactionCanonicalBilling(transaction: Transaction): CanonicalBillingInfo {
    // Get reference date.
    const dateMoment = timestampToMoment(isSingle(transaction)
      ? transaction.single.date
      : maxBy(transaction.group!.children, child => timestampToWholeSeconds(child.date))!.date
    );

    const rawBilling = this.resolveTransactionRawBilling(transaction);
    return this.getCanonicalBilling(rawBilling, dateMoment);
  }

  /**
   * Returns the NOT canonicalized billing info that applies to a transaction by
   * resolving inheritance from labels according to the given partial order.
   */
  resolveTransactionRawBilling(transaction: Transaction): BillingInfo {
    // Check for individual billing config on transaction.
    if (isValidBilling(transaction.billing)) {
      return transaction.billing;
    }

    // Check for billing config inherited from labels.
    // Of the labels with present billing config, the first dominant label will
    // be applied and the rest ignored.
    const relevantLabels = transaction.labels
      .filter(label => isValidBilling(this.dataService.getLabelBilling(label)));
    const dominantLabels = getDominantLabels(relevantLabels, this.getLabelDominanceOrder());
    if (dominantLabels.length > 0) {
      return this.dataService.getLabelBilling(dominantLabels[0]);
    }

    // Initially assume unknown (default) billing.
    return new BillingInfo({ periodType: BillingType.UNKNOWN });
  }

  /**
   * Returns the canonical form of a BillingInfo object:
   * - "periodType" is inferred to DAY if unknown.
   * - "date" is explicitly set and defaults to the reference date.
   * - "endDate" is explicitly set and defaults to the value of "date".
   * - Relative dates are resolved into absolute dates.
   * - All dates are normalized to include the full interval with day granularity.
   *   * periodType == DAY: no normalization necessary
   *   * periodType == MONTH: "date" is 1st day of the month, "endDate" last day of the month.
   *   * periodType == YEAR: "date" is Jan 1st, "endDate" is Dec 31st.
   */
  getCanonicalBilling(billing: BillingInfo, referenceMoment: moment.Moment): CanonicalBillingInfo {
    const periodType = (billing.periodType === BillingType.UNKNOWN ? BillingType.DAY : billing.periodType);

    // Adjust granularity of reference moment to beginning of period type.
    const normalizedReference = normalizeMomentToPeriodType(referenceMoment, periodType);

    let startMoment = billing.date
      ? (billing.isRelative
        ? addDelta(normalizedReference, billing.date)
        : protoDateToMoment(billing.date))
      : normalizedReference;
    let endMoment = billing.endDate
      ? (billing.isRelative
        ? addDelta(normalizedReference, billing.endDate)
        : protoDateToMoment(billing.endDate))
      : startMoment.clone();

    startMoment = normalizeMomentToPeriodType(startMoment, periodType);
    endMoment = normalizeMomentToPeriodType(endMoment, periodType);

    // If necessary, normalize end date to "end of month/year".
    if (periodType === BillingType.YEAR) {
      endMoment.month(11).date(31);
    } else if (periodType === BillingType.MONTH) {
      // endMoment is currently at the 1st of the month.
      endMoment.add(1, 'month').subtract(1, 'day');
    }

    return <CanonicalBillingInfo>new BillingInfo({
      periodType,
      isRelative: false,
      date: momentToProtoDate(startMoment),
      endDate: momentToProtoDate(endMoment),
    });
  }

  private getLabelDominanceOrder(): { [label: string]: number } {
    return this.dataService.getUserSettings().labelDominanceOrder;
  }
}

function normalizeMomentToPeriodType(theMoment: moment.Moment, periodType: BillingType): moment.Moment {
  const normalized = theMoment.clone();
  switch (periodType) {
    case BillingType.YEAR:
      normalized.month(0);
    // fall-through
    case BillingType.MONTH:
      normalized.date(1);
    // fall-through
    case BillingType.DAY:
    case BillingType.NONE:
      normalized.set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
  }
  return normalized;
}

function addDelta(referenceMoment: moment.Moment, delta: ProtoDate): moment.Moment {
  return referenceMoment.clone()
    .add(delta.year, 'year')
    .add(delta.month, 'month')
    .add(delta.day, 'day');
}
