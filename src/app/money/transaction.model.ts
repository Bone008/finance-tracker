/** Data model of a single recorded transaction. */
export interface Transaction {
  date: Date;
  amount: number;
  who: string;

  isCash: boolean;

  labels: string[];
  reasonForTransfer?: string;
  comment?: string;
}

export function createTransaction(date: Date, amount: number, who: string, isCash = false, labels?: string[], comment?: string): Transaction {
  return {
    date,
    amount,
    who,
    isCash,
    labels: labels ? labels.sort() : [],
    comment,
  }
}
