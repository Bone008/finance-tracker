import { Injectable } from "@angular/core";
import * as moment from 'moment';
import { Transaction, TransactionData } from "../../proto/model";
import { moneyToNumber, timestampToMoment } from '../core/proto-util';
import { extractTransactionData } from "./model-util";

/**
 * Business logic for filtering of transaction.
 */
@Injectable({
  providedIn: 'root'
})
export class TransactionFilterService {

  /** Applies a raw filter to a collection of transactions. */
  applyFilter(transactions: Transaction[], filter: string): Transaction[] {
    const [parsedFilter, errors] = this.tokenizeFilter(filter);
    return transactions.filter(t => this.matchesFilter(t, parsedFilter));
  }

  /** Tests if a single transaction passes a parsed filter. */
  private matchesFilter(transaction: Transaction, parsedFilter: FilterToken[]): boolean {
    if (parsedFilter.length === 0) {
      return true;
    }

    const dataList = extractTransactionData(transaction);
    const match = parsedFilter.every(token =>
      token.matcher(transaction, dataList) !== token.inverted);
    return match;
  }

  private tokenizeFilter(filter: string): [FilterToken[], number[]] {
    const parsedTokens: FilterToken[] = [];

    for (let token of filter.split(/\s+/)) {
      const inverted = token.startsWith("-");
      if (inverted) token = token.substr(1);

      let tokenKey: string | null;
      let tokenValue: string;
      const sepIndex = token.indexOf(':');
      if (sepIndex > 0) {
        tokenKey = token.substr(0, sepIndex);
        tokenValue = token.substr(sepIndex + 1);
      } else {
        tokenKey = null;
        tokenValue = token;
      }

      const matcher = this.parseMatcher(tokenKey, tokenValue);
      if (matcher) {
        parsedTokens.push({ matcher, inverted });
      } else {
        // TODO error handling of invalid matchers
      }
    }

    return [parsedTokens, []];
  }

  /** Processes a single 'key:value' component of the filter string. Returns null on error. */
  private parseMatcher(key: string | null, value: string): FilterMatcher | null {
    switch (key) {
      case 'date':
        // TODO support > and < operators
        const searchMoment = moment(value);
        if (!searchMoment.isValid()) { return null; }
        return (_, dataList) =>
          dataList.some(data => timestampToMoment(data.date).isSame(searchMoment, 'day'));

      case 'amount':
        // TODO support < and > operators, and maybe ~
        const searchAmount = parseFloat(value);
        return this.makeRegexMatcher(value, (regex, _, dataList) =>
          dataList.some(data => Math.abs(moneyToNumber(data.amount) - searchAmount) < 0.01)
        );

      case 'reason':
        return this.makeRegexMatcher(value, (regex, _, dataList) =>
          dataList.some(data => regex.test(data.reason))
        );

      case 'who':
        return this.makeRegexMatcher(value, (regex, _, dataList) =>
          dataList.some(data => regex.test(data.reason))
        );

      case 'whoidentifier':
        return this.makeRegexMatcher(value, (regex, _, dataList) =>
          dataList.some(data => regex.test(data.reason))
        );

      case 'bookingtext':
        return this.makeRegexMatcher(value, (regex, _, dataList) =>
          dataList.some(data => regex.test(data.reason))
        );

      case 'comment':
        return this.makeRegexMatcher(value, (regex, _, dataList) =>
          dataList.some(data => regex.test(data.comment))
        );

      case 'label':
        return this.makeRegexMatcher(value, (regex, transaction) =>
          transaction.labels.some(label => regex.test(label))
        );

      case null:
        // Generic matcher that searches all relevant fields.
        return this.makeRegexMatcher(value, (regex, transaction, dataList) =>
          dataList.some(data =>
            regex.test(data.who)
            || regex.test(data.whoIdentifier)
            || regex.test(data.reason)
            || regex.test(data.bookingText)
            || regex.test(data.comment)
            || transaction.labels.some(label => regex.test(label))));

      default:
        // invalid keyword
        return null;
    }
  }

  /**
   * Parses the given value as a regular expression and returns a FilterMatcher
   * that applies that expression to the data, or returns null if the regex could not be parsed.
   */
  private makeRegexMatcher(value: string, matcher: (regex: RegExp, transaction: Transaction, dataList: TransactionData[]) => boolean)
    : FilterMatcher | null {
    const regex = this.parseRegex(value);
    if (regex) {
      return (transaction, dataList) => matcher(regex, transaction, dataList);
    } else {
      return null;
    }
  }

  private parseRegex(value: string): RegExp | null {
    try { return new RegExp(value, 'i'); }
    catch (e) { return null; }
  }
}

// TODO remove
const fieldIdentifiers = [
  'date',
  'amount',
  'reason',
  'who',
  'whoIdentifier',
  'bookingText',
  'comment',
  'is', // cash, bank, single, group
  'label',
]

type FilterMatcher = (transaction: Transaction, dataList: TransactionData[]) => boolean;
interface FilterToken {
  matcher: FilterMatcher;
  inverted: boolean;
}