import { Account, BillingInfo, BillingType, DataContainer, GroupData, Transaction, TransactionData, UserSettings } from "../../proto/model";
import { pushDeduplicate, removeByValue } from '../core/util';
import { CurrencyService } from './currency.service';
import { DataService } from './data.service';

/** Monetary values closer to zero than this threshold should be considered 0. */
export const MONEY_EPSILON = 0.005;
/** The character that is used in label names to define a hierarchy. */
export const LABEL_HIERARCHY_SEPARATOR = '/';

/** Creates a DataContainer filled with default values upon first visit. */
export function createDefaultDataContainer(): DataContainer {
  return new DataContainer({
    accounts: [
      new Account({ id: 1, name: 'Cash', icon: 'account_balance_wallet', currency: 'EUR' }),
      new Account({ id: 2, name: 'Bank account', icon: 'account_balance', currency: 'EUR' }),
    ],
    userSettings: new UserSettings({ defaultAccountIdOnAdd: 1 }),
  });
}


/** Type guard to check if a transaction has dataType 'single'. */
export function isSingle(transaction: Transaction)
  : transaction is Transaction & { single: TransactionData } {
  return transaction.dataType === 'single';
}

/** Type guard to check if a transaction has dataType 'group'. */
export function isGroup(transaction: Transaction)
  : transaction is Transaction & { group: GroupData } {
  return transaction.dataType === 'group';
}

/**
 * Extracts all TransactionData from one or multiple transactions,
 * no matter if they are of type single or group.
 */
export function extractTransactionData(subject: Transaction | Transaction[]): TransactionData[] {
  if (subject instanceof Transaction) {
    if (isSingle(subject)) {
      return [subject.single!];
    } else {
      return subject.group!.children;
    }
  } else {
    return Array.prototype.concat(
      ...subject.map(transaction => extractTransactionData(transaction))
    );
  }
}

/**
 * Applies a function to all TransactionData contained in one or multiple
 * transactions, no matter if they are of type single or group.
 */
export function forEachTransactionData(
  subject: Transaction | Transaction[],
  callback: (data: TransactionData) => any,
  thisArg?: any
) {
  if (subject instanceof Transaction) {
    if (isSingle(subject)) {
      callback.apply(thisArg, [subject.single]);
    } else {
      subject.group!.children.forEach(callback, thisArg);
    }
  } else {
    for (const transaction of subject) {
      forEachTransactionData(transaction, callback, thisArg);
    }
  }
}

/**
 * Maps all TransactionData contained in one or multiple transactions to
 * a target, no matter if they are of type single or group.
 */
export function mapTransactionData<R>(
  subject: Transaction | Transaction[],
  mapper: (data: TransactionData, index: number, array: TransactionData[]) => R
): R[] {
  if (subject instanceof Transaction) {
    if (isSingle(subject)) {
      return [mapper(subject.single, 0, [subject.single])];
    } else {
      return subject.group!.children.map(mapper);
    }
  } else {
    return Array.prototype.concat(
      ...subject.map(transaction => mapTransactionData(transaction, mapper))
    );
  }
}

/**
 * Returns the values of a specific data field of all TransactionData contained
 * in one or multiple transactions, no matter if they are of type single or group.
 */
export function mapTransactionDataField<K extends keyof TransactionData>(
  subject: Transaction | Transaction[],
  dataField: K
): TransactionData[K][] {
  return mapTransactionData(subject, data => data[dataField]);
}

/** Returns the summed amount of any transaction, converted to the given (or main) currency. */
export function getTransactionAmount(transaction: Transaction,
  dataService: DataService,
  currencyService: CurrencyService,
  optTargetCurrency?: string
): number {
  // Short-circuit: Treat as zero sum transaction if explicitly marked as such.
  if (isGroup(transaction) && transaction.group.isCrossCurrencyTransfer) {
    return 0;
  }

  const targetCurrency = optTargetCurrency || dataService.getMainCurrency();
  return mapTransactionData(transaction, data => {
    const currency = getTransactionDataCurrency(data, dataService);
    const amount = currencyService.convertAmount(data.amount, currency, targetCurrency);
    if (amount === null) {
      console.warn(`Failed to convert currency while summing transaction amount: ${amount} ${currency} --> ${targetCurrency}`);
      return 0;
    }
    return amount;
  })
    .reduce((a, b) => a + b, 0);
}

/**
 * Returns the currency code of the given TransactionData based on its account.
 * Nnote that as a mapper function, this can also be accessed as `dataService.currencyFromTxDataFn`.
 */
export function getTransactionDataCurrency(data: TransactionData, dataService: DataService): string {
  return dataService.getAccountById(data.accountId).currency;
}

/** If only one currency appears in the given transactions, returns its code, otherwise returns null. */
export function getTransactionUniqueCurrency(subject: Transaction | Transaction[], dataService: DataService): string | null {
  let uniqueCurrency: string | null = null;
  const currencies = mapTransactionData(subject, dataService.currencyFromTxDataFn);
  for (const currency of currencies) {
    if (uniqueCurrency === null) {
      uniqueCurrency = currency;
    } else if (uniqueCurrency !== currency) {
      return null; // more than 1 currency
    }
  }
  return uniqueCurrency;
}

/** Returns an unordered list of all labels that occur in any of the given transactions. */
export function extractAllLabels(transactions: Iterable<Transaction>): string[] {
  return Array.from(extractAllLabelsSet(transactions));
}

/** Returns the set of all labels that occur in any of the given transactions. */
export function extractAllLabelsSet(transactions: Iterable<Transaction>): Set<string> {
  const labels = new Set<string>();
  for (const transaction of transactions) {
    for (const label of transaction.labels) {
      labels.add(label);
    }
  }
  return labels;
}

/** Sanitizes an input string to be a valid label name. */
export function sanitizeLabelName(rawName: string): string {
  return rawName.trim().toLowerCase();
}

/**
 * Adds a label to a transaction after sanitizing it and checking for duplicates.
 * @returns true if the label was added, false if it already existed
 */
export function addLabelToTransaction(transaction: Transaction, label: string): boolean {
  return pushDeduplicate(transaction.labels, sanitizeLabelName(label));
}

/**
 * Removes a label from a transaction if it exists (after sanitizing it).
 * @returns true if the label was removed, false if it was not found
 */
export function removeLabelFromTransaction(transaction: Transaction, label: string): boolean {
  return removeByValue(transaction.labels, sanitizeLabelName(label));
}

/** Returns the parent label of a nested label, or null if it is at top level. */
export function getLabelParentOf(label: string): string | null {
  const sepIndex = label.lastIndexOf(LABEL_HIERARCHY_SEPARATOR);
  if (sepIndex > 0) {
    return label.substr(0, sepIndex);
  }
  return null;
}

/**
 * Returns an ordered subset of labels that are dominant with respect to a given
 * partial order. The given labels and the returned subset may be empty.
 */
export function getDominantLabels(
  labels: string[],
  labelDominanceOrder: { [label: string]: number },
  excludedLabels: string[] = []
): string[] {
  // Fast path for simple cases.
  if (labels.length <= 1 && excludedLabels.length === 0) {
    return labels;
  }
  // Get applicable labels ranked by their dominance in descending order.
  // Equally dominant labels are sorted in alphabetical order.
  const labelInfos = labels
    .filter(label => excludedLabels.indexOf(label) === -1)
    .map(label => ({ label, dominance: labelDominanceOrder[label] || 0 }))
    .sort((a, b) => (b.dominance - a.dominance) || a.label.localeCompare(b.label));

  return labelInfos
    // Only use dominant labels.
    .filter(info => info.dominance === labelInfos[0].dominance)
    .map(info => info.label);
}

/** Checks if the given (nullable) billing is set to a non-empty value. */
export function isValidBilling(billing: BillingInfo | null | undefined): billing is BillingInfo {
  return !!billing && billing.periodType !== BillingType.UNKNOWN;
}
