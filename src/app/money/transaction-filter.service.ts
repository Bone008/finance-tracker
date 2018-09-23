import { Injectable } from "@angular/core";
import { Transaction } from "../../proto/model";
import { extractTransactionData } from "./model-util";

/**
 * Business logic for filtering of transaction.
 */
@Injectable({
  providedIn: 'root'
})
export class TransactionFilterService {

  applyFilter(transactions: Transaction[], filter: string): Transaction[] {
    return transactions.filter(t => this.matchesFilter(t, filter));
  }

  matchesFilter(transaction: Transaction, filter: string): boolean {
    if (!filter) return true;

    const dataList = extractTransactionData(transaction);

    return filter.split(/\s+/).every(filterPart => {
      const inverted = filterPart.startsWith("-");
      if (inverted) filterPart = filterPart.substr(1);

      let filterRegex;
      try { filterRegex = new RegExp(filterPart, 'i'); }
      catch (e) { return true; } // Assume user is still typing, always pass.

      const match = dataList.some(data =>
        filterRegex.test(data.who)
        || filterRegex.test(data.whoIdentifier)
        || filterRegex.test(data.reason)
        || filterRegex.test(data.bookingText)
        || filterRegex.test(data.comment)
        || transaction.labels.some(label => filterRegex.test(label))
      );

      return match !== inverted;
    });
  }
}
