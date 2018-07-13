import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PapaParseModule } from 'ngx-papaparse';
import { MaterialModule } from '../material.module';
import { FormImportComponent } from './form-import/form-import.component';
import { MoneyComponent } from './money.component';
import { TransactionListComponent } from './transaction-list/transaction-list.component';
import { AddInlineLabelComponent } from './transaction-list/add-inline-label.component';
import { TransactionEditComponent } from './transaction-edit/transaction-edit.component';
import { DialogDeleteWithOrphansComponent } from './dialog-delete-with-orphans/dialog-delete-with-orphans.component';

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
  ],
  entryComponents: [
    FormImportComponent,
    TransactionEditComponent,
    DialogDeleteWithOrphansComponent,
  ],
  exports: [
    MoneyComponent,
  ],
})
export class MoneyModule { }
