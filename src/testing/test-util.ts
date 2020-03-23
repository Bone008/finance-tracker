import * as moment from "moment";
import { momentToTimestamp, numberToMoney, timestampNow } from "src/app/core/proto-util";
import { BillingInfo, BillingType, Date as ProtoDate, IBillingInfo, IDate, Transaction, TransactionData } from "src/proto/model";

/** Helper to create a basic single transaction. */
export function makeTx(dateStr: string, amount: number, labels: string[] = [], billing?: IBillingInfo): Transaction {
  return new Transaction({
    labels,
    billing: billing ? new BillingInfo(billing) : undefined,
    single: new TransactionData({
      accountId: 1,
      date: momentToTimestamp(moment(dateStr)),
      amount: numberToMoney(amount),
      created: timestampNow(),
    })
  });
}

/** Helper to create a BillingInfo. */
export function makeBilling(periodType: 'day' | 'month' | 'year' | 'none', fromDate?: IDate, toDate?: IDate, isRelative = false): BillingInfo {
  return new BillingInfo({
    periodType: BillingType[periodType.toUpperCase()],
    date: fromDate ? new ProtoDate(fromDate) : undefined,
    endDate: toDate ? new ProtoDate(toDate) : undefined,
    isRelative,
  });
}
