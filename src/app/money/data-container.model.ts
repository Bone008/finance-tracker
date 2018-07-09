import { Transaction } from "./transaction.model";

/** Root container for all database entries related to the Finance Tracker */
export class DataContainer {
  lastModified = new Date(0);
  transactions: Transaction[] = [];
}