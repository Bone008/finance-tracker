import { GroupData, Transaction, TransactionData } from "../../proto/model";

/** Type guard to check if a transaction has dataType 'single'. */
export function isSingle(transaction: Transaction)
  : transaction is Transaction & { single: TransactionData } {
  return transaction.dataType === 'single';
}

/** Type guard to check if a transaction has dataType 'group'. */
export function isGroup(transaction: Transaction)
  : transaction is Transaction & { group: GroupData } {
  return transaction.dataType === 'group';
}

/**
 * Extracts all TransactionData from one or multiple transactions,
 * no matter if they are of type single or group.
 */
export function extractTransactionData(subject: Transaction | Transaction[]): TransactionData[] {
  if (subject instanceof Transaction) {
    if (isSingle(subject)) {
      return [subject.single!];
    } else {
      return subject.group!.children;
    }
  } else {
    return Array.prototype.concat(
      ...subject.map(transaction => extractTransactionData(transaction))
    );
  }
}

/**
 * Applies a function to all TransactionData contained in one or multiple
 * transactions, no matter if they are of type single or group.
 */
export function forEachTransactionData(
  subject: Transaction | Transaction[],
  callback: (data: TransactionData) => any,
  thisArg?: any
) {
  if (subject instanceof Transaction) {
    if (isSingle(subject)) {
      callback.apply(thisArg, [subject.single]);
    } else {
      subject.group!.children.forEach(callback, thisArg);
    }
  } else {
    for (const transaction of subject) {
      forEachTransactionData(transaction, callback, thisArg);
    }
  }
}

/**
 * Maps all TransactionData contained in one or multiple transactions to
 * a target, no matter if they are of type single or group.
 */
export function mapTransactionData<R>(
  subject: Transaction | Transaction[],
  mapper: (data: TransactionData, index: number, array: TransactionData[]) => R
): R[] {
  if (subject instanceof Transaction) {
    if (isSingle(subject)) {
      return [mapper(subject.single, 0, [subject.single])];
    } else {
      return subject.group!.children.map(mapper);
    }
  } else {
    return Array.prototype.concat(
      ...subject.map(transaction => mapTransactionData(transaction, mapper))
    );
  }
}

/**
 * Returns the values of a specific data field of all TransactionData contained
 * in one or multiple transactions, no matter if they are of type single or group.
 */
export function mapTransactionDataField<K extends keyof TransactionData>(
  subject: Transaction | Transaction[],
  dataField: K
): TransactionData[K][] {
  return mapTransactionData(subject, data => data[dataField]);
}