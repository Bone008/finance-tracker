import { Component, Inject, OnInit } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { Account } from 'src/proto/model';
import { CurrencyService } from '../../currency.service';

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
  readonly allCurrencyCodes: string[];
  readonly editMode: 'add' | 'edit';
  readonly account: Account;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: AccountEditConfig,
    private readonly currencyService: CurrencyService,
    private readonly matDialogRef: MatDialogRef<AccountEditComponent>,
  ) {
    this.allCurrencyCodes = this.currencyService.getAllCodes().slice().sort();

    this.account = data.account;
    this.editMode = data.editMode;
  }

  ngOnInit() {
  }

  getCurrencySymbol(currencyCode: string): string {
    return this.currencyService.getSymbol(currencyCode);
  }

  onSubmit() {
    this.matDialogRef.close(true);
  }
}
