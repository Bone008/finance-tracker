import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { PapaParseModule } from 'ngx-papaparse';
import { MaterialModule } from '../material.module';
import { AnalyticsComponent } from './analytics/analytics.component';
import { BucketBreakdownComponent } from './analytics/bucket-breakdown.component';
import { ChartComponent } from './analytics/chart.component';
import { DialogLabelDominanceComponent } from './analytics/dialog-label-dominance/dialog-label-dominance.component';
import { LabelBreakdownComponent } from './analytics/label-breakdown.component';
import { BillingInfoComponent } from './billing-info/billing-info.component';
import { CommentsComponent } from './comments/comments.component';
import { DialogSettingsComponent } from './dialog-settings/dialog-settings.component';
import { DialogStaleDataComponent } from './dialog-stale-data/dialog-stale-data.component';
import { FilterFormatValidatorDirective } from './filter-input/filter-format-validator.directive';
import { FilterInputComponent } from './filter-input/filter-input.component';
import { LabelChipComponent } from './label-chip/label-chip.component';
import { LabelsComponent } from './labels/labels.component';
import { MoneyComponent } from './money.component';
import { RuleEditComponent } from './rules/rule-edit/rule-edit.component';
import { RulesComponent } from './rules/rules.component';
import { DialogDeleteWithOrphansComponent } from './transactions/dialog-delete-with-orphans/dialog-delete-with-orphans.component';
import { DialogSplitTransactionComponent } from './transactions/dialog-split-transaction/dialog-split-transaction.component';
import { FormImportComponent } from './transactions/form-import/form-import.component';
import { TransactionEditComponent } from './transactions/transaction-edit/transaction-edit.component';
import { AddInlineLabelComponent } from './transactions/transaction-labels/add-inline-label.component';
import { TransactionLabelsComponent } from './transactions/transaction-labels/transaction-labels.component';
import { TransactionsComponent } from './transactions/transactions.component';

const appRoutes: Routes = [
  { path: 'transactions', component: TransactionsComponent },
  { path: 'labels', component: LabelsComponent },
  { path: 'rules', component: RulesComponent },
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
    TransactionsComponent,
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
    LabelBreakdownComponent,
    DialogLabelDominanceComponent,
    BillingInfoComponent,
    BucketBreakdownComponent,
    DialogStaleDataComponent,
    RulesComponent,
    LabelChipComponent,
    RuleEditComponent,
  ],
  entryComponents: [
    FormImportComponent,
    TransactionEditComponent,
    RuleEditComponent,
    DialogDeleteWithOrphansComponent,
    DialogSplitTransactionComponent,
    DialogSettingsComponent,
    DialogLabelDominanceComponent,
    DialogStaleDataComponent,
  ],
  exports: [
    MoneyComponent,
  ],
})
export class MoneyModule { }
