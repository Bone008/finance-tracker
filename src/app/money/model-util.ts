import { TransactionData, Transaction } from "../../proto/model";

/**
 * Extracts all TransactionData from one or multiple transactions,
 * no matter if they are of type single or group.
 */
export function extractAllTransactionData(subject: Transaction | Transaction[]): TransactionData[] {
  if (subject instanceof Transaction) {
    if (subject.dataType === "single") {
      return [subject.single!];
    } else {
      return subject.group!.children;
    }
  } else {
    return Array.prototype.concat(
      ...subject.map(transaction => extractAllTransactionData(transaction))
    );
  }
}
