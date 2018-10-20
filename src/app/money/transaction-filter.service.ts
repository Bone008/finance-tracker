import { Injectable } from "@angular/core";
import * as moment from 'moment';
import { ITransactionData, Transaction, TransactionData } from "../../proto/model";
import { timestampToMoment } from '../core/proto-util';
import { splitQuotedString } from "../core/util";
import { extractTransactionData, getTransactionAmount, isGroup, isSingle } from "./model-util";

type MatcherOperator = ':' | '=' | '~' | '<' | '>' | '<=' | '>=';
type FilterMatcher = (transaction: Transaction, dataList: TransactionData[]) => boolean;
interface FilterToken {
  matcher: FilterMatcher;
  inverted: boolean;
}

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

    const tokenRegex = /^(\w+)(:|=|~|<|>|<=|>=)(.*)$/;

    for (let i = 0; i < rawTokens.length; i++) {
      let token = rawTokens[i];
      const inverted = token.startsWith('-');
      if (inverted) token = token.substr(1);

      let tokenKey: string | null;
      let tokenOperator: MatcherOperator;
      let tokenValue: string;
      const match = tokenRegex.exec(token);
      if (match !== null) {
        tokenKey = match[1];
        tokenOperator = match[2] as MatcherOperator;
        tokenValue = match[3];
      } else if (token.startsWith('=')) {
        tokenKey = null;
        tokenOperator = '=';
        tokenValue = token.substr(1);
      } else {
        tokenKey = null;
        tokenOperator = ':';
        tokenValue = token;
      }

      const matcher = this.parseMatcher(tokenKey, tokenOperator, tokenValue);
      if (matcher) {
        parsedTokens.push({ matcher, inverted });
      } else {
        errorIndices.push(i);
      }
    }

    return [parsedTokens, errorIndices];
  }

  /** Processes a single 'key:value' component of the filter string. Returns null on error. */
  private parseMatcher(key: string | null, operator: MatcherOperator, value: string): FilterMatcher | null {
    switch (key) {
      case 'is':
        if (operator !== ':') return null;
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
        return this.makeDateMatcher(value, operator, 'date');
      case 'created':
        return this.makeDateMatcher(value, operator, 'created');
      case 'modified':
        return this.makeDateMatcher(value, operator, 'modified');

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
        return this.makeRegexMatcher(value, operator, (test, _, dataList) =>
          dataList.some(data => test(data.reason))
        );

      case 'who':
        return this.makeRegexMatcher(value, operator, (test, _, dataList) =>
          dataList.some(data => test(data.who))
        );

      case 'whoidentifier':
        return this.makeRegexMatcher(value, operator, (test, _, dataList) =>
          dataList.some(data => test(data.whoIdentifier))
        );

      case 'bookingtext':
        return this.makeRegexMatcher(value, operator, (test, _, dataList) =>
          dataList.some(data => test(data.reason))
        );

      case 'comment':
        return this.makeRegexMatcher(value, operator, (test, _, dataList) =>
          dataList.some(data => test(data.comment))
        );

      case 'label':
        return this.makeRegexMatcher(value, operator, (test, transaction) =>
          transaction.labels.some(label => test(label))
        );

      case null:
        // Generic matcher that searches all relevant fields.
        return this.makeRegexMatcher(value, operator, (test, transaction, dataList) =>
          dataList.some(data =>
            test(data.who)
            || test(data.whoIdentifier)
            || test(data.reason)
            || test(data.bookingText)
            || test(data.comment)
            || test(getTransactionAmount(transaction).toFixed(2))
            || test(timestampToMoment(data.date).format('YYYY-MM-DD'))
            || transaction.labels.some(label => test(label))));

      default:
        // invalid keyword
        return null;
    }
  }

  /**
   * Parses the given value as a regular expression and returns a FilterMatcher
   * that applies that expression to the data, or returns null if the regex could not be parsed.
   */
  private makeRegexMatcher(value: string, operator: MatcherOperator,
    matcher: (test: ((input: string) => boolean), transaction: Transaction, dataList: TransactionData[]) => boolean)
    : FilterMatcher | null {
    if (operator === '=') {
      return (transaction, dataList) => matcher(input => input.toLowerCase() === value, transaction, dataList);
    } else if (operator !== ':') {
      // invalid operator
      return null;
    }
    const regex = this.parseRegex(value);
    if (regex) {
      return (transaction, dataList) => matcher(input => regex.test(input), transaction, dataList);
    } else {
      // invalid regex
      return null;
    }
  }

  private makeDateMatcher(value: string, operator: MatcherOperator,
    fieldName: keyof ITransactionData & ('date' | 'created' | 'modified'))
    : FilterMatcher | null {
    // TODO handle operator param
    if (value === 'empty' || value === 'never') {
      return (_, dataList) => dataList.some(data => !data[fieldName]);
    } else {
      // TODO handle month and year granularity
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
