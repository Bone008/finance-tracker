import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PapaParseModule } from 'ngx-papaparse';
import { MaterialModule } from '../material.module';
import { DialogDeleteWithOrphansComponent } from './dialog-delete-with-orphans/dialog-delete-with-orphans.component';
import { DialogSettingsComponent } from './dialog-settings/dialog-settings.component';
import { DialogSplitTransactionComponent } from './dialog-split-transaction/dialog-split-transaction.component';
import { FormImportComponent } from './form-import/form-import.component';
import { MoneyComponent } from './money.component';
import { TransactionEditComponent } from './transaction-edit/transaction-edit.component';
import { AddInlineLabelComponent } from './transaction-list/add-inline-label.component';
import { TransactionListComponent } from './transaction-list/transaction-list.component';
import { RouterModule, Routes } from '@angular/router';
import { AnalyticsComponent } from './analytics/analytics.component';
import { LabelsComponent } from './labels/labels.component';

const appRoutes: Routes = [
  { path: 'transactions', component: TransactionListComponent },
  { path: 'labels', component: LabelsComponent },
  { path: 'analytics', component: AnalyticsComponent },
  { path: '', pathMatch: 'full', redirectTo: 'transactions' }
];

@NgModule({
  imports: [
    CommonModule,
    RouterModule.forRoot(appRoutes),
    FormsModule,
    HttpClientModule,
    MaterialModule,
    PapaParseModule,
  ],
  declarations: [
    MoneyComponent,
    AnalyticsComponent,
    FormImportComponent,
    TransactionEditComponent,
    TransactionListComponent,
    AddInlineLabelComponent,
    DialogDeleteWithOrphansComponent,
    DialogSplitTransactionComponent,
    DialogSettingsComponent,
    LabelsComponent,
  ],
  entryComponents: [
    FormImportComponent,
    TransactionEditComponent,
    DialogDeleteWithOrphansComponent,
    DialogSplitTransactionComponent,
    DialogSettingsComponent,
  ],
  exports: [
    MoneyComponent,
  ],
})
export class MoneyModule { }
