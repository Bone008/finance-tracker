import { Component, Input, OnInit } from '@angular/core';
import * as moment from 'moment';
import { BillingInfo, BillingType, Date as ProtoDate } from '../../../proto/model';
import { momentToProtoDate, protoDateToMoment } from '../../core/proto-util';

enum BillingPeriodSelection {
  INHERIT,
  DAY,
  DAYS,
  MONTH,
  MONTHS,
  YEAR,
  YEARS
}

@Component({
  selector: 'app-billing-info',
  templateUrl: './billing-info.component.html',
  styleUrls: ['./billing-info.component.css']
})
export class BillingInfoComponent implements OnInit {
  readonly PERIOD_TYPE_UNKNOWN = BillingType.UNKNOWN;
  readonly PERIOD_TYPE_DAY = BillingType.DAY;
  readonly PERIOD_TYPE_MONTH = BillingType.MONTH;
  readonly PERIOD_TYPE_YEAR = BillingType.YEAR;

  @Input()
  billing: BillingInfo;

  private showCustom = false;
  isRange = false;

  constructor() { }

  ngOnInit() {
    this.showCustom = !!(this.billing.date || this.billing.endDate);
  }

  getBillingPeriod(): BillingPeriodSelection {
    return this.billingTypeToSelection(this.billing.periodType, this.isRange);
  }

  setBillingPeriod(selection: BillingPeriodSelection) {
    [this.billing.periodType, this.isRange] =
      this.selectionToBillingType(selection);

    // Reset dates to default values.
    this.billing.date = null;
    this.billing.endDate = null;
  }

  getShowCustom(): boolean {
    return this.showCustom;
  }

  setShowCustom(value: boolean) {
    this.showCustom = value;
    if (!value) {
      this.billing.date = null;
      this.billing.endDate = null;
    }
  }

  getIsRelative(): boolean {
    return this.billing.isRelative;
  }

  setIsRelative(value: boolean) {
    this.billing.isRelative = value;

    // Reset dates to default values.
    this.billing.date = null;
    this.billing.endDate = null;
  }

  getCustomDateStr(range: 0 | 1): string | null {
    const m = this.getCustomMoment(range);
    return m ? m.format('YYYY-MM-DD') : null;
  }
  getCustomDateYear(range: 0 | 1): number | null {
    const m = this.getCustomMoment(range);
    return m ? m.year() : null;
  }
  private getCustomMoment(range: 0 | 1): moment.Moment | null {
    const value = (range === 0 ? this.billing.date : this.billing.endDate);
    if (value) {
      return protoDateToMoment(value);
    }
    return null;
  }

  setCustomComponent(range: 0 | 1, type: 'date' | 'month' | 'year', value: string | null) {
    console.log(`setting ${type} to`, value);
    let protoDate: ProtoDate | null;
    if (value === null || value === '') {
      protoDate = null;
    }
    else if (type === 'date') {
      protoDate = momentToProtoDate(moment(value));
    }
    else if (type === 'month') {
      protoDate = momentToProtoDate(moment(value));
      protoDate.day = 0;
    }
    else if (type === 'year') {
      protoDate = new ProtoDate({ year: Number(value) });
    }
    else throw new Error('invalid component type: ' + type);

    if (range === 0) {
      this.billing.date = protoDate;
      // Bounds check: Don't set start date past end date.
      if (protoDate && this.billing.endDate
        && this.getCustomMoment(0)!.isAfter(this.getCustomMoment(1)!)) {
        this.setCustomComponent(1, type, value);
      }
    } else {
      this.billing.endDate = protoDate;
      // Bounds check: Don't set end date before end date.
      if (protoDate && this.billing.date
        && this.getCustomMoment(0)!.isAfter(this.getCustomMoment(1)!)) {
        this.setCustomComponent(0, type, value);
      }
    }
  }

  getCustomRelative(range: 0 | 1): number | null {
    const value = (range === 0 ? this.billing.date : this.billing.endDate);
    if (!value) return (range === 0 ? 0 : null);

    switch (this.billing.periodType) {
      case BillingType.DAY: return value.day;
      case BillingType.MONTH: return value.month;
      case BillingType.YEAR: return value.year;
      default: return null;
    }
  }

  setCustomRelative(range: 0 | 1, value: number | null) {
    let protoDate: ProtoDate | null;
    if (value === null) {
      protoDate = null;
    } else {
      switch (this.billing.periodType) {
        case BillingType.DAY: protoDate = new ProtoDate({ day: value }); break;
        case BillingType.MONTH: protoDate = new ProtoDate({ month: value }); break;
        case BillingType.YEAR: protoDate = new ProtoDate({ year: value }); break;
        default: throw new Error('invalid billing period type for setting relative offset');
      }
    }

    if (range === 0) {
      this.billing.date = protoDate;
      // Bounds check: Don't set start offset past end offset.
      if (protoDate && this.billing.endDate
        && this.getCustomRelative(0)! > this.getCustomRelative(1)!) {
        this.setCustomRelative(1, value);
      }
    } else {
      this.billing.endDate = protoDate;
      // Bounds check: Don't set end offset before start offset.
      if (protoDate && this.billing.endDate
        && this.getCustomRelative(0)! > this.getCustomRelative(1)!) {
        this.setCustomRelative(0, value);
      }
    }
  }

  private selectionToBillingType(selection: BillingPeriodSelection): [BillingType, boolean] {
    switch (selection) {
      case BillingPeriodSelection.INHERIT: return [BillingType.UNKNOWN, false];
      case BillingPeriodSelection.DAY: return [BillingType.DAY, false];
      case BillingPeriodSelection.DAYS: return [BillingType.DAY, true];
      case BillingPeriodSelection.MONTH: return [BillingType.MONTH, false];
      case BillingPeriodSelection.MONTHS: return [BillingType.MONTH, true];
      case BillingPeriodSelection.YEAR: return [BillingType.YEAR, false];
      case BillingPeriodSelection.YEARS: return [BillingType.YEAR, true];
      default: return [BillingType.UNKNOWN, false];
    }
  }

  private billingTypeToSelection(type: BillingType, multiple: boolean): BillingPeriodSelection {
    switch (type) {
      case BillingType.UNKNOWN: return BillingPeriodSelection.INHERIT;
      case BillingType.DAY: return (multiple ? BillingPeriodSelection.DAYS : BillingPeriodSelection.DAY);
      case BillingType.MONTH: return (multiple ? BillingPeriodSelection.MONTHS : BillingPeriodSelection.MONTH);
      case BillingType.YEAR: return (multiple ? BillingPeriodSelection.YEARS : BillingPeriodSelection.YEAR);
      default: return BillingPeriodSelection.INHERIT;
    }
  }

}
