import { Injectable } from '@angular/core';

// TODO: Load from (cached) JSON file.
const NBSP = '\xA0';
const SUPPORTED_CURRENCIES = {
  'EUR': '€',
  'USD': '$',
  'CHF': 'Fr',
  'ILS': '₪',
  'BGN': 'лв',
};

@Injectable({
  providedIn: 'root'
})
export class CurrencyService {
  constructor() { }

  /** Returns an unordered list of all known currency codes. */
  getAllCodes(): string[] {
    return Object.keys(SUPPORTED_CURRENCIES);
  }

  /** Returns the symbol of a currency code, or the code itself if no symbol is known. */
  getSymbol(currencyCode: string): string {
    const symbol = SUPPORTED_CURRENCIES[currencyCode];
    return symbol || currencyCode;
  }

  /** Formats the given amount with the respective currency symbol. */
  format(amount: number, currencyCode: string): string {
    // Note: not using style:'currency', because it does not allow individual control over the
    // placement of the currency symbol and the separator chars.
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      + NBSP + this.getSymbol(currencyCode);
  }
}
