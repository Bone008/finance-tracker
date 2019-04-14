import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CurrencyService {
  // TODO: Load from (cached) JSON file.
  private readonly SUPPORTED_CURRENCIES = {
    'EUR': '€',
    'USD': '$',
    'CHF': 'Fr',
    'ILS': '₪',
    'BGN': 'лв',
  };

  constructor() { }

  getAllCodes(): string[] {
    return Object.keys(this.SUPPORTED_CURRENCIES);
  }

  getSymbol(currencyCode: string): string {
    const symbol = this.SUPPORTED_CURRENCIES[currencyCode];
    return symbol || currencyCode;
  }
}
