import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PapaParseModule } from 'ngx-papaparse';
import { MaterialModule } from '../material.module';
import { FormImportComponent } from './form-import/form-import.component';
import { MoneyComponent } from './money.component';
import { TransactionDetailComponent } from './transaction-detail/transaction-detail.component';
import { TransactionListComponent } from './transaction-list/transaction-list.component';
import { AddInlineLabelComponent } from './transaction-list/add-inline-label.component';

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
    TransactionListComponent,
    TransactionDetailComponent,
    AddInlineLabelComponent,
  ],
  entryComponents: [
    FormImportComponent,
    TransactionDetailComponent,
  ],
  exports: [
    MoneyComponent,
  ],
})
export class MoneyModule { }
