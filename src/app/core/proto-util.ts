import { Money, google } from "../../proto/model";
import * as Long from "long";

export function timestampNow(): google.protobuf.Timestamp {
  return dateToTimestamp(Date.now());
}

export function dateToTimestamp(date: Date|number): google.protobuf.Timestamp {
  const time = date instanceof Date ? date.getTime() : date;
  return new google.protobuf.Timestamp({
    seconds: Math.trunc(time / 1000),
    nanos: (time % 1000) * 1e6,
  });
}

export function timestampToDate(timestamp: google.protobuf.Timestamp | null | undefined): Date {
  if (!timestamp) return new Date(0);
  return new Date(longToNumber(timestamp.seconds) * 1000 + timestamp.nanos / 1e6);
}

export function timestampToMilliseconds(timestamp: google.protobuf.Timestamp | null | undefined): number {
  if (!timestamp) return 0;
  return longToNumber(timestamp.seconds) * 1000 + timestamp.nanos / 1e6;
}

export function timestampToWholeSeconds(timestamp: google.protobuf.Timestamp | null | undefined): number {
  if (!timestamp) return 0;
  return longToNumber(timestamp.seconds);
}

export function compareTimestamps(a: google.protobuf.Timestamp | null | undefined, b: google.protobuf.Timestamp | null | undefined): number {
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  const diffSeconds = longToNumber(a.seconds) - longToNumber(b.seconds);
  if (diffSeconds !== 0) return diffSeconds;

  return a.nanos - b.nanos;
}

export function numberToMoney(num: number): Money {
  return new Money({
    units: Math.trunc(num),
    subunits: Math.round(num * 100) % 100,
  });
}

export function moneyToNumber(money: Money | null | undefined): number {
  if (!money) return 0;
  return money.units + money.subunits / 100;
}

function longToNumber(long: Long | number): number {
  if (Long.isLong(long)) {
    return (<Long>long).toNumber();
  } else {
    return <number>long;
  }
}
