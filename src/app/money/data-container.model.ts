import { Transaction } from "./transaction.model";

/** Root container for all database entries related to the Finance Tracker */
export interface DataContainer {

  lastModified: Date;
  transactions: Transaction[];
}