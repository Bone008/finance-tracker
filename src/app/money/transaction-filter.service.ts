import { Injectable } from "@angular/core";
import * as moment from 'moment';
import { ITransactionData, Transaction, TransactionData } from "../../proto/model";
import { timestampToMoment } from '../core/proto-util';
import { splitQuotedString } from "../core/util";
import { extractTransactionData, getTransactionAmount, isGroup, isSingle } from "./model-util";

/**
 * Business logic for filtering of transaction.
 */
@Injectable({
  providedIn: 'root'
})
export class TransactionFilterService {

  /** Applies a raw filter to a collection of transactions. */
  applyFilter(transactions: Transaction[], filter: string): Transaction[] {
    const rawTokens = splitQuotedString(filter);
    const [parsedFilter, errorIndices] = this.parseTokens(rawTokens);
    if (errorIndices.length > 0) {
      // Empty results on error
      // TODO somehow allow highlighting errors
      console.warn('There are errors in the filter!', errorIndices);
      return [];
    } else {
      return transactions.filter(t => this.matchesFilter(t, parsedFilter));
    }
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

  /**
   * Parses each token string into a token ready for matching.
   * Returns the list of successful
   */
  private parseTokens(rawTokens: string[]): [FilterToken[], number[]] {
    const parsedTokens: FilterToken[] = [];
    const errorIndices: number[] = [];

    for (let i = 0; i < rawTokens.length; i++) {
      let token = rawTokens[i];
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
        errorIndices.push(i);
      }
    }

    return [parsedTokens, errorIndices];
  }

  /** Processes a single 'key:value' component of the filter string. Returns null on error. */
  private parseMatcher(key: string | null, value: string): FilterMatcher | null {
    switch (key) {
      case 'is':
        if (value === 'cash') {
          return (_, dataList) => dataList.some(data => data.isCash);
        } else if (value === 'bank') {
          return (_, dataList) => dataList.some(data => !data.isCash);
        } else if (value === 'mixed') {
          return (_, dataList) => dataList.some(data => data.isCash) && dataList.some(data => !data.isCash);
        } else if (value === 'single') {
          return isSingle;
        } else if (value === 'group') {
          return isGroup;
        } else {
          // invalid 'is' keyword
          return null;
        }
      case 'date':
        return this.makeDateMatcher(value, 'date');
      case 'created':
        return this.makeDateMatcher(value, 'created');
      case 'modified':
        return this.makeDateMatcher(value, 'modified');

      case 'amount':
        // TODO support < and > operators, and maybe ~, and maybe = for non-abs
        const searchAmount = parseFloat(value);
        const allowNegative = true;
        const allowNonNegative = (searchAmount >= 0);
        const searchAbsoluteAmount = Math.abs(searchAmount);
        return transaction => {
          const amount = getTransactionAmount(transaction);
          return ((allowNegative && amount < 0) || (allowNonNegative && amount >= 0))
            && Math.abs(Math.abs(amount) - searchAbsoluteAmount) < 0.005;
        };

      case 'reason':
        return this.makeRegexMatcher(value, (regex, _, dataList) =>
          dataList.some(data => regex.test(data.reason))
        );

      case 'who':
        return this.makeRegexMatcher(value, (regex, _, dataList) =>
          dataList.some(data => regex.test(data.who))
        );

      case 'whoidentifier':
        return this.makeRegexMatcher(value, (regex, _, dataList) =>
          dataList.some(data => regex.test(data.whoIdentifier))
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
            || regex.test(getTransactionAmount(transaction).toFixed(2))
            || regex.test(timestampToMoment(data.date).format('YYYY-MM-DD'))
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
      // invalid regex
      return null;
    }
  }

  private makeDateMatcher(value: string, fieldName: keyof ITransactionData & ('date' | 'created' | 'modified'))
    : FilterMatcher | null {
    if (value === 'empty' || value === 'never') {
      return (_, dataList) => dataList.some(data => !data[fieldName]);
    } else {
      // TODO support > and < operators
      const searchMoment = moment(value);
      if (!searchMoment.isValid()) { return null; }
      return (_, dataList) =>
        dataList.some(data => timestampToMoment(data[fieldName]).isSame(searchMoment, 'day'));
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