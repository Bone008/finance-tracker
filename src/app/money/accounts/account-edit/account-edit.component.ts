import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Account } from 'src/proto/model';
import { CurrencyMetadata, CurrencyService } from '../../currency.service';

export interface AccountEditConfig {
  account: Account;
  editMode: 'add' | 'edit';
}

@Component({
  selector: 'app-account-edit',
  templateUrl: './account-edit.component.html',
  styleUrls: ['./account-edit.component.css']
})
export class AccountEditComponent implements OnInit {
  readonly allCurrencyMetadata: CurrencyMetadata[];
  readonly editMode: 'add' | 'edit';
  readonly account: Account;

  private readonly initialCurrency: string;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: AccountEditConfig,
    private readonly currencyService: CurrencyService,
    private readonly matDialogRef: MatDialogRef<AccountEditComponent>,
  ) {
    this.allCurrencyMetadata = this.currencyService.getAllCurrencyMetadata()
      .sort((a, b) => a.code.localeCompare(b.code));

    this.account = data.account;
    this.editMode = data.editMode;
    this.initialCurrency = this.account.currency;
  }

  ngOnInit() {
  }

  getCurrencySymbol(currencyCode: string): string {
    return this.currencyService.getSymbol(currencyCode);
  }

  onSubmit() {
    if (this.editMode == 'edit' && this.account.currency !== this.initialCurrency) {
      if (!confirm('By changing this account\'s currency, all associated transactions and balances '
        + 'will be treated as the new currency without changing their numeric values.\n\n'
        + 'Are you sure you want to continue?')) {
        return;
      }
    }
    this.matDialogRef.close(true);
  }
}
