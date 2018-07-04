import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TransactionListComponent } from './transaction-list/transaction-list.component';
import { TransactionDetailComponent } from './transaction-detail/transaction-detail.component';
import { MoneyComponent } from './money.component';
import { MaterialModule } from '../material.module';

@NgModule({
  imports: [
    CommonModule,
    MaterialModule,
  ],
  declarations: [
    MoneyComponent,
    TransactionListComponent,
    TransactionDetailComponent,
  ],
  exports: [
    MoneyComponent,
  ],
})
export class MoneyModule { }
