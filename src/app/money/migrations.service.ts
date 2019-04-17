import { Injectable } from '@angular/core';
import { Account, DataContainer, UserSettings } from 'src/proto/model';
import { KeyedNumberAggregate } from '../core/keyed-aggregate';
import { extractTransactionData } from './model-util';

/** Processes hooks for preprocessing old migration data. */
@Injectable({
  providedIn: 'root'
})
export class MigrationsService {

  // Note: Currently cannot depend on DataService as it is invoked by it.
  // Design decision that may be changed.
  constructor() { }

  preprocessDataContainer(data: DataContainer) {
    // Note that this is currently running for empty DataContainers as well (which is probably a
    // good thing, but we might add default accounts more officially than here).
    this.migrateAccounts(data);
  }

  private migrateAccounts(data: DataContainer) {
    if (data.accounts.length > 0) {
      return;
    }

    const ID_CASH = 1;
    const ID_BANK = 2;
    const ID_CREDIT_CARD = 3;

    if (!data.userSettings) {
      data.userSettings = new UserSettings();
    }
    data.userSettings.defaultAccountIdOnAdd = ID_CASH;

    const migrationStatistics = new KeyedNumberAggregate();
    // Assign transactions to default accounts depending on isCash flag.
    let foundCreditCard = false;
    for (const txData of extractTransactionData(data.transactions)) {
      if (txData.accountId === 0) {
        if (txData.bookingText === 'KREDITKARTE') {
          txData.accountId = ID_CREDIT_CARD;
          foundCreditCard = true;
        } else {
          txData.accountId = txData.isCash ? ID_CASH : ID_BANK;
        }

        migrationStatistics.add(txData.accountId.toString(), 1);
      }
    }

    // Register default accounts.
    data.accounts.push(
      new Account({ id: ID_CASH, name: "Cash", icon: "money", currency: "EUR" }),
      new Account({ id: ID_BANK, name: "Bank account", icon: "assignment", currency: "EUR" }),
    );
    if (foundCreditCard) {
      data.accounts.push(
        new Account({ id: ID_CREDIT_CARD, name: "Credit card", icon: "credit_card", currency: "EUR" })
      );
    }

    if (data.transactions.length > 0) {
      // Notify about migration.
      let message =
        `Migrated ${data.transactions.length} transactions to the new account structure.\n` +
        `The "cash" flag of transactions is now deprecated and should no longer be used.\n\n` +
        'The following accounts have been set up:\n';
      for (const account of data.accounts) {
        message += `${account.name}: ${migrationStatistics.get(account.id.toString())} transactions\n`;
      }

      console.log(message);
      alert(message);
    }
  }

}
