import { Injectable } from '@angular/core';
import { Money } from 'src/proto/model';
import { moneyToNumber } from '../core/proto-util';
import { MONEY_EPSILON } from './model-util';

const NBSP = '\xA0';

interface CurrencyInfo {
  /** Human readable name */
  name: string;
  /** Short symbol, if available */
  symbol: string;
  exchangeRateToEUR: number;
}
type CurrencyInfoMap = { [currencyCode: string]: CurrencyInfo };

export interface CurrencyMetadata extends CurrencyInfo {
  /** 3 letter currency code */
  code: string;
}

// TODO: Load from (cached) JSON file.
// Hard-coded exchange rates as of 2019-06-16 from www.xe.com.
const SUPPORTED_CURRENCIES: CurrencyInfoMap = {
  'EUR': { symbol: '€', exchangeRateToEUR: 1, name: 'Euro' },
  'USD': { symbol: '$', exchangeRateToEUR: 0.8924, name: 'US Dollar' },
  'CHF': { symbol: 'Fr', exchangeRateToEUR: 0.91, name: 'Swiss Franc' }, // Compromise with Sep 2019.
  'ILS': { symbol: '₪', exchangeRateToEUR: 0.2478, name: 'Israeli Shekel' },
  'BGN': { symbol: 'лв', exchangeRateToEUR: 0.5113, name: 'Bulgarian Lev' },
  'RON': { symbol: 'lei', exchangeRateToEUR: 0.2121, name: 'Romanian Leu' },
  'HUF': { symbol: 'Ft', exchangeRateToEUR: 0.0031, name: 'Hungarian Forint' },
  'CZK': { symbol: 'Kč', exchangeRateToEUR: 0.0392, name: 'Czech Koruna' },
  // below: exchange rates are Jul19 - Sep19 average.
  'GBP': { symbol: '£', exchangeRateToEUR: 1.10752, name: 'British Pound' },
  'CAD': { symbol: 'C$', exchangeRateToEUR: 0.68022, name: 'Canadian Dollar' },
  'SEK': { symbol: 'kr', exchangeRateToEUR: 0.09383, name: 'Swedish Krona' },
  'DKK': { symbol: 'kr.', exchangeRateToEUR: 0.13393, name: 'Danish Krone' },
  'ISK': { symbol: 'kr', exchangeRateToEUR: 0.00721, name: 'Icelandic Krona' },
  'NOK': { symbol: 'kr', exchangeRateToEUR: 0.10156, name: 'Norwegian Krone' },
  'TRY': { symbol: '₺', exchangeRateToEUR: 0.15801, name: 'Turkish Lira' },
  // below: exchange rate from 2020-12-30
  'KRW': { symbol: '₩', exchangeRateToEUR: 0.00075, name: 'South Korean Won' },
};

@Injectable({
  providedIn: 'root'
})
export class CurrencyService {
  constructor() { }

  /**
   * Returns an unordered list of all known currencies and their metadata.
   * The result MAY be mutated.
   */
  getAllCurrencyMetadata(): CurrencyMetadata[] {
    return Object.entries(SUPPORTED_CURRENCIES)
      .map(([code, info]) => ({ code, ...info }));
  }

  /**
   * Attempts to convert the given amount in a given currency to a target currency.
   * Returns null if a currency or its exchange rate is unknown.
   */
  convertAmount(amount: number | Money | null | undefined, amountCurrency: string, targetCurrency: string): number | null {
    if (amount instanceof Money || amount === null || amount === undefined) {
      amount = moneyToNumber(amount);
    }
    // Short-circuit converting to the same currency.
    if (amountCurrency === targetCurrency) {
      return amount;
    }

    const exchangeRate = this.getExchangeRate(amountCurrency, targetCurrency);
    if (exchangeRate === null) {
      return null;
    }

    return amount * exchangeRate;
  }

  /**
   * Returns the exchange rate to convert from one currency to another.
   * Returns null if a currency or its exchange rate is unknown.
   **/
  getExchangeRate(fromCurrency: string, toCurrency: string): number | null {
    const fromInfo = SUPPORTED_CURRENCIES[fromCurrency];
    const toInfo = SUPPORTED_CURRENCIES[toCurrency];
    if (!fromInfo || !toInfo) {
      return null; // Currency not supported.
    }

    // new_money = old_money * (EUR/old) / (EUR/new)
    return fromInfo.exchangeRateToEUR / toInfo.exchangeRateToEUR;
  }

  /** Returns the symbol of a currency code, or the code itself if no symbol is known. */
  getSymbol(currencyCode: string): string {
    const info = SUPPORTED_CURRENCIES[currencyCode];
    return info ? info.symbol : currencyCode;
  }

  /**
   * Formats the given amount (number or Money object) with the respective currency symbol.
   * Does NOT perform any conversion!
   */
  format(amount: number | Money | null | undefined, currencyCode: string, forceSign = false): string {
    if (amount instanceof Money || amount === null || amount === undefined) {
      amount = moneyToNumber(amount);
    }
    // Prevent ~0 values from being interpreted as either positive or negative.
    if (Math.abs(amount) < MONEY_EPSILON) {
      amount = 0;
    }

    // Note: not using style:'currency', because it does not allow individual control over the
    // placement of the currency symbol and the separator chars.
    return (forceSign && amount >= 0 ? '+' : '')
      + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      + NBSP + this.getSymbol(currencyCode);
  }
}
