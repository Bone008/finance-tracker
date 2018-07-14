import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PapaParseModule } from 'ngx-papaparse';
import { MaterialModule } from '../material.module';
import { DialogDeleteWithOrphansComponent } from './dialog-delete-with-orphans/dialog-delete-with-orphans.component';
import { DialogSplitTransactionComponent } from './dialog-split-transaction/dialog-split-transaction.component';
import { FormImportComponent } from './form-import/form-import.component';
import { MoneyComponent } from './money.component';
import { TransactionEditComponent } from './transaction-edit/transaction-edit.component';
import { AddInlineLabelComponent } from './transaction-list/add-inline-label.component';
import { TransactionListComponent } from './transaction-list/transaction-list.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    MaterialModule,
    PapaParseModule,
  ],
  declarations: [
    MoneyComponent,
    FormImportComponent,
    TransactionEditComponent,
    TransactionListComponent,
    AddInlineLabelComponent,
    DialogDeleteWithOrphansComponent,
    DialogSplitTransactionComponent,
  ],
  entryComponents: [
    FormImportComponent,
    TransactionEditComponent,
    DialogDeleteWithOrphansComponent,
    DialogSplitTransactionComponent,
  ],
  exports: [
    MoneyComponent,
  ],
})
export class MoneyModule { }
