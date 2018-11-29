import { Injectable } from "@angular/core";
import * as moment from 'moment';
import { ITransactionData, Transaction, TransactionData } from "../../proto/model";
import { timestampToMoment } from '../core/proto-util';
import { filterFuzzyOptions, splitQuotedString } from "../core/util";
import { DataService } from "./data.service";
import { extractTransactionData, getTransactionAmount, isGroup, isSingle } from "./model-util";

type FilterMatcher = (transaction: Transaction, dataList: TransactionData[]) => boolean;
interface FilterToken {
  matcher: FilterMatcher;
  inverted: boolean;
}
type MatcherOperator = ':' | '=' | '<' | '>' | '<=' | '>=';
const TOKEN_REGEX = /^(\w+)(:|=|<=?|>=?)(.*)$/;

// List of valid filter keywords used for autocomplete.
// Note: Should be alphabetically sorted.
const TOKEN_KEYWORDS = [
  'is', 'date', 'created', 'modified', 'amount', 'reason', 'who', 'whoidentifier', 'bookingtext', 'comment', 'label'
].sort();
const TOKEN_IS_KEYWORDS = [
  'cash', 'bank', 'mixed', 'single', 'group', 'expense', 'income'
].sort();
const TOKEN_OPERATORS_BY_KEYWORD: { [keyword: string]: MatcherOperator[] } = {
  'is': [':'],
  'date': [':', '=', '<', '>', '<=', '>='],
  'created': [':', '=', '<', '>', '<=', '>='],
  'modified': [':', '=', '<', '>', '<=', '>='],
  'amount': [':', '=', '<', '>', '<=', '>='],
  'reason': [':', '='],
  'who': [':', '='],
  'whoidentifier': [':', '='],
  'bookingtext': [':', '='],
  'comment': [':', '='],
  'label': [':', '='],
};

const MOMENT_YEAR_REGEX = /^\d{4}$/;
const MOMENT_MONTH_REGEX = /^(\d{4}-\d{1,2}|\w{3}(\d{2}){0,2})$/;
const MOMENT_DATE_FORMATS = [
  // day granularity
  'YYYY-MM-DD',
  'YYYY-M-DD',
  'YYYY-MM-D',
  'YYYY-M-D',
  // month granularity
  'YYYY-MM',
  'YYYY-M',
  'MMMYYYY',
  'MMMYY',
  'MMM',
  // year granularity
  'YYYY',
];


/**
 * Business logic for filtering of transaction.
 */
@Injectable({
  providedIn: 'root'
})
export class TransactionFilterService {

  constructor(private readonly dataService: DataService) { }

  suggestFilterContinuations(filter: string): string[] {
    // Do not suggest anything when at start of new token.
    if (filter.endsWith(' ')) {
      return [];
    }

    const rawTokens = splitQuotedString(filter);
    if (rawTokens.length === 0) return [];
    let lastToken = rawTokens.pop()!.toLowerCase();
    let continuationPrefix = rawTokens.join(' ') + (rawTokens.length > 0 ? ' ' : '');
    if (lastToken.startsWith('-')) {
      lastToken = lastToken.substr(1);
      continuationPrefix += '-';
    }

    // Suggest special "is:" filters.
    if (lastToken.startsWith('is:')) {
      continuationPrefix += 'is:';
      return filterFuzzyOptions(TOKEN_IS_KEYWORDS, lastToken.substr(3), true)
        .map(keyword => continuationPrefix + keyword + ' ');
    }
    // Suggest labels.
    else if (lastToken.startsWith('label:') || lastToken.startsWith('label=')) {
      continuationPrefix += lastToken.substr(0, 6);
      return filterFuzzyOptions(this.dataService.getAllLabels().sort(), lastToken.substr(6), true)
        .map(keyword => continuationPrefix + keyword + ' ');
    }
    else {
      const keywordMatches = filterFuzzyOptions(TOKEN_KEYWORDS, lastToken);
      if (keywordMatches.length === 1) {
        // Suggest operators supported by keyword.
        continuationPrefix += keywordMatches[0];
        const supportedOperators = TOKEN_OPERATORS_BY_KEYWORD[keywordMatches[0]] || [];
        return supportedOperators.map(operator => continuationPrefix + operator);
      } else {
        // Suggest keywords.
        return keywordMatches.map(keyword => continuationPrefix + keyword);
      }
    }
  }

  /** Returns list of invalid tokens in the raw filter. */
  validateFilter(filter: string): string[] {
    const rawTokens = splitQuotedString(filter);
    const [_, errorIndices] = this.parseTokens(rawTokens);
    return errorIndices.map(i => rawTokens[i]);
  }

  /** Applies a raw filter to a collection of transactions. */
  applyFilter(transactions: Transaction[], filter: string): Transaction[] {
    // TODO handle partially quoted tokens, such as: ="foobar" who:"Hans Wurst"
    const rawTokens = splitQuotedString(filter);
    const [parsedFilter, errorIndices] = this.parseTokens(rawTokens);
    if (errorIndices.length > 0) {
      // Empty results on error
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
   * Returns the list of successfully parsed tokens and the input indices of the unsuccessful tokens.
   */
  private parseTokens(rawTokens: string[]): [FilterToken[], number[]] {
    const parsedTokens: FilterToken[] = [];
    const errorIndices: number[] = [];

    for (let i = 0; i < rawTokens.length; i++) {
      let token = rawTokens[i];
      const inverted = token.startsWith('-');
      if (inverted) token = token.substr(1);

      let tokenKey: string | null;
      let tokenOperator: MatcherOperator;
      let tokenValue: string;
      const match = TOKEN_REGEX.exec(token);
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
    // !!!!!!!!!!
    // Note: When changing the set of these keywords, make sure to also
    // update the arrays for autocompletion at the top of this file!
    // !!!!!!!!!!
    switch (key) {
      case 'is':
        if (operator !== ':') return null;
        switch (value.toLowerCase()) {
          case 'cash': return (_, dataList) => dataList.some(data => data.isCash);
          case 'bank': return (_, dataList) => dataList.some(data => !data.isCash);
          case 'mixed': return (_, dataList) => dataList.some(data => data.isCash) && dataList.some(data => !data.isCash);
          case 'single': return isSingle;
          case 'group': return isGroup;
          case 'expense': return transaction => getTransactionAmount(transaction) < -0.005;
          case 'income': return transaction => getTransactionAmount(transaction) > 0.005;
          default:
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
        return this.makeNumericMatcher(value, operator, getTransactionAmount);

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
          dataList.some(data => test(data.bookingText))
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
    // TODO support relative date input
    if (value === 'empty' || value === 'never') {
      if (operator !== ':') return null; // invalid operator
      return (_, dataList) => dataList.some(data => !data[fieldName]);
    } else {
      let granularity: 'year' | 'month' | 'day';
      if (MOMENT_YEAR_REGEX.test(value)) {
        granularity = 'year';
      } else if (MOMENT_MONTH_REGEX.test(value)) {
        granularity = 'month';
      } else {
        granularity = 'day';
      }
      const searchMoment = moment(value, MOMENT_DATE_FORMATS, true);

      if (!searchMoment.isValid()) {
        // invalid date format
        return null;
      }

      let predicate: (date: moment.Moment, granularity: 'year' | 'month' | 'day') => boolean;
      switch (operator) {
        case '<': predicate = searchMoment.isAfter; break;
        case '<=': predicate = searchMoment.isSameOrAfter; break;
        case '>': predicate = searchMoment.isBefore; break;
        case '>=': predicate = searchMoment.isSameOrBefore; break;
        case ':':
        case '=': predicate = searchMoment.isSame; break;
      }
      return (_, dataList) =>
        dataList.some(data => predicate.call(searchMoment, timestampToMoment(data[fieldName]), granularity));
    }
  }

  private makeNumericMatcher(value: string, operator: MatcherOperator,
    accessor: (transaction: Transaction, dataList: TransactionData[]) => number)
    : FilterMatcher | null {
    const searchAmount = Number(value);
    if (isNaN(searchAmount)) {
      // invalid amount
      return null;
    }

    const subPrecision = (value.indexOf('.') !== -1 || (operator !== ':' && operator !== '='));
    // If the value is negative or 0, do a strict match considering the sign.
    if (searchAmount <= 0 || operator === '=') {
      return (transaction, dataList) => {
        let amount = accessor(transaction, dataList);
        if (!subPrecision) amount = Math.floor(amount);
        switch (operator) {
          case '<': return amount < (searchAmount - 0.005);
          case '<=': return amount < (searchAmount + 0.005);
          case '>': return amount > (searchAmount + 0.005);
          case '>=': return amount > (searchAmount - 0.005);
          case ':':
          case '=': return Math.abs(amount - searchAmount) < 0.005;
        }
      };
    }
    else {
      console.assert(searchAmount > 0);
      // Sign-agnostic matching.
      return (transaction, dataList) => {
        let absAmount = Math.abs(accessor(transaction, dataList));
        if (!subPrecision) absAmount = Math.floor(absAmount);
        switch (operator) {
          case '<': return absAmount < (searchAmount - 0.005);
          case '<=': return absAmount < (searchAmount + 0.005);
          case '>': return absAmount > (searchAmount + 0.005);
          case '>=': return absAmount > (searchAmount - 0.005);
          case ':': return Math.abs(absAmount - searchAmount) < 0.005;
          // '=' is handled above.
        }
      };
    }
  }

  private parseRegex(value: string): RegExp | null {
    try { return new RegExp(value, 'i'); }
    catch (e) { return null; }
  }
}
