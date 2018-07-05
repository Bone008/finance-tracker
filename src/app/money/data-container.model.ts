import { Transaction } from "./transaction.model";

/** Root container for all database entries related to the Money Tracker */
export interface DataContainer {

  lastModified: Date;
  transactions: Transaction[];
}