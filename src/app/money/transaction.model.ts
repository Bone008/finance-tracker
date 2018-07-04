export interface Transaction {
  date: Date;
  amount: number;
  who: string;
  reasonForTransfer?: string;
}

export function createTransaction(amount: number, who: string): Transaction {
  return {
    date: new Date(),
    amount,
    who,
  }
}
