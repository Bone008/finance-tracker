/** Data model of a single recorded transaction. */
export interface Transaction {
  date: Date;
  amount: number;
  who: string;
  whoSecondary?: string;

  isCash: boolean;

  labels: string[];
  reasonForTransfer?: string;
  bookingText?: string;
  comment?: string;
}

export function createEmptyTransaction(): Transaction {
  return {
    date: new Date(0),
    amount: 0,
    who: "",
    isCash: false,
    labels: [],
  };
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
