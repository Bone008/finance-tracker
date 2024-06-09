import * as Long from "long";
import * as moment from 'moment';
import * as $protobuf from "protobufjs";
import { Date as ProtoDate, google, Money } from "../../proto/model";

/** Mapped type from a proto message interface where all values are required and non-null. */
export type RequiredProto<M> = { [K in keyof Required<M>]: NonNullable<Required<M>[K]> };

/** Type alias for message classes that can encode/decode messages of type M. */
type MessageRW<M> = {
  encode: (message: M, writer?: $protobuf.Writer) => $protobuf.Writer,
  decode: (reader: ($protobuf.Reader | Uint8Array), length?: number) => M,
};
/** Creates a deep copy of a message by encoding and decoding it. */
export function cloneMessage<M>(messageType: MessageRW<M>, message: M) {
  const encoded = messageType.encode(message).finish();
  return messageType.decode(encoded);
}

export function timestampNow(): google.protobuf.Timestamp {
  return dateToTimestamp(Date.now());
}

export function dateToTimestamp(date: Date | number): google.protobuf.Timestamp {
  const time = date instanceof Date ? date.getTime() : date;
  return new google.protobuf.Timestamp({
    seconds: Math.trunc(time / 1000),
    nanos: (time % 1000) * 1e6,
  });
}

export function millisecondsToTimestamp(millis: number): google.protobuf.Timestamp {
  return new google.protobuf.Timestamp({
    seconds: Math.trunc(millis / 1000),
    nanos: (millis % 1000) * 1e6,
  });
}

export function momentToTimestamp(m: moment.Moment): google.protobuf.Timestamp {
  return new google.protobuf.Timestamp({
    seconds: m.unix(),
    nanos: m.valueOf() % 1000,
  });
}

export function timestampToMoment(timestamp: google.protobuf.Timestamp | null | undefined): moment.Moment {
  if (!timestamp) return moment(0);
  return moment(longToNumber(timestamp.seconds) * 1000 + timestamp.nanos / 1e6);
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

/** Converts a proto Timestamp to a ProtoDate using local time. */
export function timestampToProtoDate(timestamp: google.protobuf.Timestamp): ProtoDate;
/** Converts a proto Timestamp to a ProtoDate using local time. */
export function timestampToProtoDate(timestamp: google.protobuf.Timestamp | null | undefined): ProtoDate | null | undefined;
export function timestampToProtoDate(timestamp: google.protobuf.Timestamp | null | undefined): ProtoDate | null | undefined {
  if (!timestamp) return timestamp;
  return dateToProtoDate(timestampToDate(timestamp));
}

/** Converts a JS Date to a ProtoDate using local time. */
export function dateToProtoDate(d: Date): ProtoDate {
  return new ProtoDate({
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  });
}

export function momentToProtoDate(m: moment.Moment): ProtoDate {
  return new ProtoDate({
    year: m.year(),
    month: m.month() + 1,
    day: m.date(),
  });
}

export function protoDateToDate(date: ProtoDate | null | undefined): Date {
  if (!date) return new Date(0);
  return new Date(date.year, date.month - 1, date.day);
}

export function protoDateToMoment(date: ProtoDate | null | undefined): moment.Moment {
  if (!date) return moment.invalid();

  if (date.year === 0) {
    throw new Error('cannot convert date without year to moment');
  }
  return moment([
    date.year,
    // Default to January if only year-granularity given.
    Math.max(0, date.month - 1),
    // Default to 1st of month if only month-granularity given.
    Math.max(1, date.day)
  ]);
}

export function numberToMoney(num: number): Money {
  const totalSubunits = Math.round(num * 100);
  return new Money({
    units: Math.trunc(totalSubunits / 100),
    subunits: totalSubunits % 100, // Relies on -x % 100 = x.
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
