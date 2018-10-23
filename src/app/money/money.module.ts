import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { PapaParseModule } from 'ngx-papaparse';
import { MaterialModule } from '../material.module';
import { AnalyticsComponent } from './analytics/analytics.component';
import { ChartComponent } from './analytics/chart.component';
import { CommentsComponent } from './comments/comments.component';
import { DialogDeleteWithOrphansComponent } from './dialog-delete-with-orphans/dialog-delete-with-orphans.component';
import { DialogSettingsComponent } from './dialog-settings/dialog-settings.component';
import { DialogSplitTransactionComponent } from './dialog-split-transaction/dialog-split-transaction.component';
import { FilterFormatValidatorDirective } from './filter-input/filter-format-validator.directive';
import { FilterInputComponent } from './filter-input/filter-input.component';
import { FormImportComponent } from './form-import/form-import.component';
import { LabelsComponent } from './labels/labels.component';
import { MoneyComponent } from './money.component';
import { TransactionEditComponent } from './transaction-edit/transaction-edit.component';
import { AddInlineLabelComponent } from './transaction-labels/add-inline-label.component';
import { TransactionLabelsComponent } from './transaction-labels/transaction-labels.component';
import { TransactionListComponent } from './transaction-list/transaction-list.component';

const appRoutes: Routes = [
  { path: 'transactions', component: TransactionListComponent },
  { path: 'labels', component: LabelsComponent },
  { path: 'analytics', component: AnalyticsComponent },
  { path: 'comments', component: CommentsComponent },
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
    TransactionLabelsComponent,
    AddInlineLabelComponent,
    DialogDeleteWithOrphansComponent,
    DialogSplitTransactionComponent,
    DialogSettingsComponent,
    LabelsComponent,
    CommentsComponent,
    FilterInputComponent,
    ChartComponent,
    FilterFormatValidatorDirective,
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
