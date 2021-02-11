import { Injectable } from "@angular/core";
import * as moment from 'moment';
import { BillingType, ITransactionData, Transaction, TransactionData } from "../../proto/model";
import { moneyToNumber, protoDateToMoment, timestampToMoment, timestampToWholeSeconds } from '../core/proto-util';
import { escapeQuotedString, filterFuzzyOptions, maxBy, splitQuotedString } from "../core/util";
import { CurrencyService } from "./currency.service";
import { DataService } from "./data.service";
import { extractTransactionData, getTransactionAmount, getTransactionUniqueCurrency, isGroup, isSingle, isValidBilling, MONEY_EPSILON, resolveTransactionCanonicalBilling, resolveTransactionRawBilling } from "./model-util";

type FilterMatcher = (transaction: Transaction, dataList: TransactionData[]) => boolean;
interface FilterToken {
  matcher: FilterMatcher;
  inverted: boolean;
}
type MatcherOperator = ':' | '=' | '<' | '>' | '<=' | '>=';
const TOKEN_REGEX = /^(\w+)(:|=|<=?|>=?)(.*)$/;

// List of valid filter keywords used for autocomplete.
// Note: Alphabetically sorted by calling sort() immediately after initializer.
const TOKEN_KEYWORDS = [
  'is', 'billing', 'date', 'created', 'modified', 'amount', 'reason', 'who', 'iban', 'bookingtext', 'comment', 'label', 'account', 'currency'
].sort();
const TOKEN_IS_KEYWORDS = [
  'single', 'group', 'expense', 'income', 'imported'
].sort();
const TOKEN_BILLING_KEYWORDS = [
  'default', 'none', 'day', 'month', 'year', 'relative', 'absolute', 'individual', 'inherited', 'multiple'
].sort();
const TOKEN_DATE_KEYWORDS = [
  'never', 'today', 'yesterday', 'tomorrow',
  'thisweek', 'lastweek', 'nextweek',
  'thismonth', 'lastmonth', 'nextmonth',
  'thisyear', 'lastyear', 'nextyear',
].sort();
const TOKEN_OPERATORS_BY_KEYWORD: { [keyword: string]: MatcherOperator[] } = {
  'is': [':'],
  'billing': [':'],
  'date': [':', '=', '<', '>', '<=', '>='],
  'created': [':', '=', '<', '>', '<=', '>='],
  'modified': [':', '=', '<', '>', '<=', '>='],
  'amount': [':', '=', '<', '>', '<=', '>='],
  'reason': [':', '='],
  'who': [':', '='],
  'iban': [':', '='],
  'bookingtext': [':', '='],
  'comment': [':', '='],
  'label': [':', '='],
  'account': [':', '='],
  'currency': [':', '='],
};

const MOMENT_YEAR_REGEX = /^\d{4}$/;
const MOMENT_MONTH_REGEX = /^(\d{4}-\d{1,2}|\w{3}(\d{2}){0,2})$/;
const MOMENT_WEEK_REGEX = /^\d{4}-W\d{1,2}$/i;
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
  // week granularity
  'GGGG-[W]WW',
  'GGGG-[W]W',
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

  constructor(
    private readonly dataService: DataService,
    private readonly currencyService: CurrencyService
  ) { }

  suggestFilterContinuations(filter: string): string[] {
    // Do not suggest anything when at start of new token.
    if (filter.endsWith(' ')) {
      return [];
    }

    const rawTokens = splitQuotedString(filter);
    if (rawTokens.length === 0) return [];
    let lastToken = rawTokens.pop()!.toLowerCase();
    let continuationPrefix = filter.substr(0, filter.toLowerCase().lastIndexOf(lastToken));
    if (lastToken.startsWith('-')) {
      lastToken = lastToken.substr(1);
      continuationPrefix += '-';
    }

    // TODO Minor issues:
    // - Reduce code duplication by mapping from prefix to keyword handlers.
    // - Standardize escaping of spaces for tokens, e.g. labels with spaces.
    // - Respect start quotes entered on lastToken.

    // Suggest special "is:" filters.
    if (lastToken.startsWith('is:')) {
      continuationPrefix += 'is:';
      return filterFuzzyOptions(TOKEN_IS_KEYWORDS, lastToken.substr(3), true)
        .map(keyword => continuationPrefix + keyword + ' ');
    }

    // Suggest special "billing:" filters.
    else if (lastToken.startsWith('billing:')) {
      continuationPrefix += 'billing:';
      return filterFuzzyOptions(TOKEN_BILLING_KEYWORDS, lastToken.substr(8), true)
        .map(keyword => continuationPrefix + keyword + ' ');
    }

    // Suggest special "date:" filters.
    else if (lastToken.startsWith('date:') || lastToken.startsWith('created:') || lastToken.startsWith('modified:')) {
      const c = lastToken.indexOf(':') + 1;
      continuationPrefix += lastToken.substr(0, c);
      return filterFuzzyOptions(TOKEN_DATE_KEYWORDS, lastToken.substr(c), true)
        .map(keyword => continuationPrefix + keyword + ' ');
    }

    // Suggest labels.
    else if (lastToken.startsWith('label:') || lastToken.startsWith('label=')) {
      continuationPrefix += lastToken.substr(0, 6);
      return filterFuzzyOptions(this.dataService.getAllLabels().sort(), lastToken.substr(6), true)
        .map(keyword => continuationPrefix + keyword + ' ');
    }

    // Suggest account names.
    else if (lastToken.startsWith('account:') || lastToken.startsWith('account=')) {
      continuationPrefix += lastToken.substr(0, 8);
      const accountNames = this.dataService.getCurrentAccountList()
        .map(account => escapeQuotedString(account.name.toLowerCase()));
      return filterFuzzyOptions(accountNames.sort(), lastToken.substr(8), true)
        .map(keyword => continuationPrefix + keyword + ' ');
    }

    // Suggest used currencies.
    else if (lastToken.startsWith('currency:') || lastToken.startsWith('currency=')) {
      continuationPrefix += lastToken.substr(0, 9);
      const usedCurrencies = new Set<string>(
        this.dataService.getCurrentAccountList().map(a => a.currency.toLowerCase()));
      usedCurrencies.add('mixed');
      return filterFuzzyOptions(Array.from(usedCurrencies).sort(), lastToken.substr(9), true)
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
    const rawTokens = splitQuotedString(filter, true);
    if (rawTokens === null) {
      return ['Unterminated quote!'];
    }
    const [_, errorIndices] = this.parseTokens(rawTokens);
    return errorIndices.map(i => rawTokens[i]);
  }

  /** Parses a raw filter and returns a predicate that can filter transactions. */
  makeFilterPredicate(filter: string): (transaction: Transaction) => boolean {
    const rawTokens = splitQuotedString(filter);
    const [parsedFilter, errorIndices] = this.parseTokens(rawTokens);
    if (errorIndices.length > 0) {
      // Empty results on error
      return transaction => false;
    } else {
      return transaction => this.matchesParsedFilter(transaction, parsedFilter);
    }
  }

  /** Applies a raw filter to a collection of transactions. */
  applyFilter(transactions: Transaction[], filter: string): Transaction[] {
    return transactions.filter(this.makeFilterPredicate(filter));
  }

  /** Tests if a single transaction matches a raw filter. */
  matchesFilter(transaction: Transaction, filter: string): boolean {
    return this.applyFilter([transaction], filter).length > 0;
  }

  /** Tests if a single transaction passes a parsed filter. */
  private matchesParsedFilter(transaction: Transaction, parsedFilter: FilterToken[]): boolean {
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
          case 'single': return isSingle;
          case 'group': return isGroup;
          case 'expense': return transaction =>
            getTransactionAmount(transaction, this.dataService, this.currencyService) < -MONEY_EPSILON;
          case 'income': return transaction =>
            getTransactionAmount(transaction, this.dataService, this.currencyService) > MONEY_EPSILON;
          case 'imported':
            return (_, dataList) => dataList.some(data => data.importedRowId > 0);
          default:
            // invalid 'is' keyword
            return null;
        }
      case 'billing':
        return this.makeBillingMatcher(value, operator);
      case 'date':
        return this.makeDateMatcher(value, operator, 'date');
      case 'created':
        return this.makeDateMatcher(value, operator, 'created');
      case 'modified':
        return this.makeDateMatcher(value, operator, 'modified');

      case 'amount':
        return this.makeNumericMatcher(value, operator, (test, transaction, dataList) => {
          // Match against raw amount(s).
          if (dataList.some(data => test(moneyToNumber(data.amount)))) {
            return true;
          }
          // Match against the summed amount, preferably in the transaction's native currency,
          // otherwise in the main currency.
          const amount = getTransactionAmount(transaction, this.dataService, this.currencyService,
            getTransactionUniqueCurrency(transaction, this.dataService) || undefined);
          return test(amount);
        });

      case 'reason':
        return this.makeRegexMatcher(value, operator, (test, _, dataList) =>
          dataList.some(data => test(data.reason))
        );

      case 'who':
        return this.makeRegexMatcher(value, operator, (test, _, dataList) =>
          dataList.some(data => test(data.who))
        );

      case 'iban':
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

      case 'account':
        return this.makeRegexMatcher(value, operator, (test, _, dataList) =>
          dataList.some(data => test(this.dataService.getAccountById(data.accountId).name))
        );

      case 'currency':
        return this.makeCurrencyMatcher(value, operator);

      case null:
        // Generic matcher that searches all relevant fields.
        return this.makeRegexMatcher(value, operator, (test, transaction, dataList) =>
          dataList.some(data =>
            test(data.who)
            || test(data.whoIdentifier)
            || test(data.reason)
            || test(data.bookingText)
            || test(data.comment)
            || test(
              // Use the summed amount, preferably in the transaction's native currency,
              // otherwise in the main currency.
              getTransactionAmount(transaction, this.dataService, this.currencyService,
                getTransactionUniqueCurrency(transaction, this.dataService) || undefined
              ).toFixed(2))
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
      const lowerCaseValue = value.toLowerCase();
      return (transaction, dataList) => matcher(input => input.toLowerCase() === lowerCaseValue, transaction, dataList);
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

  /** Tries to create a matcher for currencies. */
  private makeCurrencyMatcher(value: string, operator: MatcherOperator): FilterMatcher | null {
    if (operator !== ':' && operator !== '=') {
      // Invalid operator.
      return null;
    }

    if (value.toLowerCase() === 'mixed') {
      return (_, dataList) => {
        if (dataList.length < 2) return false; // Fast path.
        const currencies =
          new Set<string>(dataList.map(this.dataService.currencyFromTxDataFn));
        return currencies.size > 1;
      };
    }
    // Match currency codes and symbols by regex.
    return this.makeRegexMatcher(value, operator, (test, _, dataList) =>
      dataList.some(data => {
        const account = this.dataService.getAccountById(data.accountId);
        return test(account.currency) || test(this.currencyService.getSymbol(account.currency));
      })
    );
  }

  /** Tries to create a matcher for the billing field. */
  private makeBillingMatcher(value: string, operator: MatcherOperator): FilterMatcher | null {
    const labelDominanceOrder = this.dataService.getUserSettings().labelDominanceOrder;
    // Helper.
    const getCanonical = (transaction: Transaction) => resolveTransactionCanonicalBilling(transaction, this.dataService, labelDominanceOrder);
    const getRaw = (transaction: Transaction) => resolveTransactionRawBilling(transaction, this.dataService, labelDominanceOrder);

    if (operator === ':') {
      // Note that this logic is closely related to TransactionsComponent.getTransactionBillingString().
      switch (value.toLowerCase()) {
        case 'default': return transaction => getRaw(transaction).periodType === BillingType.UNKNOWN;
        case 'none': return transaction => getRaw(transaction).periodType === BillingType.NONE;
        case 'day': return transaction => getRaw(transaction).periodType === BillingType.DAY;
        case 'month': return transaction => getRaw(transaction).periodType === BillingType.MONTH;
        case 'year': return transaction => getRaw(transaction).periodType === BillingType.YEAR;
        case 'relative': return transaction => {
          const billing = getRaw(transaction);
          return billing.periodType !== BillingType.UNKNOWN && billing.periodType !== BillingType.NONE && billing.isRelative;
        };
        case 'absolute': return transaction => {
          const billing = getRaw(transaction);
          return billing.periodType !== BillingType.UNKNOWN && billing.periodType !== BillingType.NONE && !billing.isRelative;
        };
        case 'individual': return transaction => isValidBilling(transaction.billing);
        // inherited ^= !individual && !default
        case 'inherited': return transaction =>
          (!transaction.billing || transaction.billing.periodType === BillingType.UNKNOWN)
          && getRaw(transaction).periodType !== BillingType.UNKNOWN;
        case 'multiple': return transaction => transaction.labels.filter(label =>
          this.dataService.getLabelBilling(label).periodType !== BillingType.UNKNOWN
        ).length > 1;
        default: // ignore, handled by more generic date range matcher
      }
    }

    // Delegate non-keywords and range operators to a date range matcher.
    return this.makeDateRangeMatcher(value, operator, transaction => {
      const billing = getCanonical(transaction);
      if (billing.periodType === BillingType.NONE) {
        // Never match.
        return [];
      }
      // Return resolved interval.
      return [[protoDateToMoment(billing.date), protoDateToMoment(billing.endDate)]];
    });
  }

  private makeDateMatcher(value: string, operator: MatcherOperator,
    fieldName: keyof ITransactionData & ('date' | 'created' | 'modified')
  ): FilterMatcher | null {
    return this.makeDateRangeMatcher(value, operator,
      (_, dataList) => {
        // TODO Replace date selection by "nominal date" of groups once we support that.
        const maxValue = maxBy(dataList, data => timestampToWholeSeconds(data[fieldName]))![fieldName];
        return [[timestampToMoment(maxValue), timestampToMoment(maxValue)]];
      });
  }

  /**
   * Creates a matcher to match against a date interval.
   * 
   * @param rangeSelector Callback that returns a list of date ranges given a transaction.
   *    Transactions pass the filter if at least one of the ranges successfully matches.
   */
  private makeDateRangeMatcher(value: string, operator: MatcherOperator,
    rangeSelector: (transaction: Transaction, dataList: TransactionData[]) => [moment.Moment, moment.Moment][]
  ): FilterMatcher | null {
    const lowerValue = value.toLowerCase();
    if (lowerValue === 'empty' || lowerValue === 'never') {
      if (operator !== ':') return null; // invalid operator
      return (t, d) => rangeSelector(t, d).some(
        interval => interval[0].unix() === 0 && interval[1].unix() === 0);
    }

    let granularity: 'year' | 'month' | 'isoWeek' | 'day';
    let searchMoment: moment.Moment;

    switch (lowerValue) {
      case 'tod':
      case 'today': granularity = 'day'; searchMoment = moment(); break;
      case 'yest':
      case 'yesterday': granularity = 'day'; searchMoment = moment().subtract(1, 'day'); break;
      case 'tom':
      case 'tomorrow': granularity = 'day'; searchMoment = moment().add(1, 'day'); break;
      case 'thisweek': granularity = 'isoWeek'; searchMoment = moment(); break;
      case 'lastweek': granularity = 'isoWeek'; searchMoment = moment().subtract(1, 'week'); break;
      case 'nextweek': granularity = 'isoWeek'; searchMoment = moment().add(1, 'week'); break;
      case 'thismonth': granularity = 'month'; searchMoment = moment(); break;
      case 'lastmonth': granularity = 'month'; searchMoment = moment().subtract(1, 'month'); break;
      case 'nextmonth': granularity = 'month'; searchMoment = moment().add(1, 'month'); break;
      case 'thisyear': granularity = 'year'; searchMoment = moment(); break;
      case 'lastyear': granularity = 'year'; searchMoment = moment().subtract(1, 'year'); break;
      case 'nextyear': granularity = 'year'; searchMoment = moment().add(1, 'year'); break;
      // Not a keyword date.
      default:
        if (MOMENT_YEAR_REGEX.test(value)) {
          granularity = 'year';
          searchMoment = moment(value, MOMENT_DATE_FORMATS, true);
        } else if (MOMENT_MONTH_REGEX.test(value)) {
          granularity = 'month';
          searchMoment = moment(value, MOMENT_DATE_FORMATS, true);
        } else if (MOMENT_WEEK_REGEX.test(value)) {
          granularity = 'isoWeek';
          searchMoment = moment(value.toUpperCase(), MOMENT_DATE_FORMATS, true);
        } else {
          granularity = 'day';
          searchMoment = moment(value, MOMENT_DATE_FORMATS, true);
        }
        if (!searchMoment.isValid()) {
          // invalid date format
          return null;
        }
    }

    let intervalPredicate: (from: moment.Moment, to: moment.Moment) => boolean;
    // LHS:  [from ........................... to]
    // RHS:                   ^-- searchMoment
    switch (operator) {
      case '<': intervalPredicate = (from, to) => from.isBefore(searchMoment, granularity); break;
      case '<=': intervalPredicate = (from, to) => from.isSameOrBefore(searchMoment, granularity); break;
      case '>': intervalPredicate = (from, to) => to.isAfter(searchMoment, granularity); break;
      case '>=': intervalPredicate = (from, to) => to.isSameOrAfter(searchMoment, granularity); break;
      case ':':
      case '=': intervalPredicate = (from, to) => from.isSameOrBefore(searchMoment, granularity) && to.isSameOrAfter(searchMoment, granularity); break;
    }
    return (t, d) => rangeSelector(t, d).some(([from, to]) => intervalPredicate(from, to));
  }

  private makeNumericMatcher(value: string, operator: MatcherOperator,
    matcher: (test: (amount: number) => boolean, transaction: Transaction, dataList: TransactionData[]) => boolean)
    : FilterMatcher | null {
    const searchAmount = Number(value);
    if (isNaN(searchAmount)) {
      // invalid amount
      return null;
    }

    let amountTester: (amount: number) => boolean;
    const subPrecision = (searchAmount === 0 || value.indexOf('.') !== -1 || (operator !== ':' && operator !== '='));
    // If the value is negative or 0, do a strict match considering the sign.
    // I believe the value of exactly 0 should work in either branch, so where
    // to put it is arbitrary.
    if (searchAmount <= 0 || operator === '=' || value.startsWith('+')) {
      amountTester = amount => {
        // Round towards 0.
        if (!subPrecision) amount = Math.trunc(amount);
        switch (operator) {
          case '<': return amount < (searchAmount - MONEY_EPSILON);
          case '<=': return amount < (searchAmount + MONEY_EPSILON);
          case '>': return amount > (searchAmount + MONEY_EPSILON);
          case '>=': return amount > (searchAmount - MONEY_EPSILON);
          case ':':
          case '=': return Math.abs(amount - searchAmount) < MONEY_EPSILON;
        }
      };
    }
    else {
      console.assert(searchAmount > 0);
      // Sign-agnostic matching.
      amountTester = amount => {
        let absAmount = Math.abs(amount);
        if (!subPrecision) absAmount = Math.trunc(absAmount);
        switch (operator) {
          case '<': return absAmount < (searchAmount - MONEY_EPSILON);
          case '<=': return absAmount < (searchAmount + MONEY_EPSILON);
          case '>': return absAmount > (searchAmount + MONEY_EPSILON);
          case '>=': return absAmount > (searchAmount - MONEY_EPSILON);
          case ':': return Math.abs(absAmount - searchAmount) < MONEY_EPSILON;
          // '=' is handled above.
        }
      };
    }

    return (transaction, dataList) => matcher(amountTester, transaction, dataList);
  }

  private parseRegex(value: string): RegExp | null {
    try { return new RegExp(value, 'i'); }
    catch (e) { return null; }
  }
}
