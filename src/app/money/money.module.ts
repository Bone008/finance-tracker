import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { NgStackFormsModule } from '@ng-stack/forms';
import { KeyboardShortcutsModule } from 'ng-keyboard-shortcuts';
import { MaterialModule } from '../material.module';
import { AccountEditComponent } from './accounts/account-edit/account-edit.component';
import { AccountsComponent } from './accounts/accounts.component';
import { BalancesComponent } from './accounts/balances/balances.component';
import { AnalyticsComponent } from './analytics/analytics.component';
import { BucketBreakdownComponent } from './analytics/bucket-breakdown.component';
import { ChartComponent } from './analytics/chart.component';
import { DialogLabelDominanceComponent } from './analytics/dialog-label-dominance/dialog-label-dominance.component';
import { LabelBreakdownComponent } from './analytics/label-breakdown.component';
import { BankSyncComponent } from './bank-sync/bank-sync.component';
import { BillingInfoComponent } from './billing-info/billing-info.component';
import { CommentsComponent } from './comments/comments.component';
import { DialogStaleDataComponent } from './dialog-stale-data/dialog-stale-data.component';
import { FilterFormatValidatorDirective } from './filter-input/filter-format-validator.directive';
import { FilterInputComponent } from './filter-input/filter-input.component';
import { ImportFileComponent } from './import/import-file.component';
import { LabelChipComponent } from './label-chip/label-chip.component';
import { LabelsComponent } from './labels/labels.component';
import { MoneyComponent } from './money.component';
import { RuleEditComponent } from './rules/rule-edit/rule-edit.component';
import { RulesComponent } from './rules/rules.component';
import { SettingsComponent } from './settings/settings.component';
import { DialogDeleteWithOrphansComponent } from './transactions/dialog-delete-with-orphans/dialog-delete-with-orphans.component';
import { DialogSplitTransactionComponent } from './transactions/dialog-split-transaction/dialog-split-transaction.component';
import { PresetsComponent } from './transactions/presets/presets.component';
import { TransactionEditComponent } from './transactions/transaction-edit/transaction-edit.component';
import { AddInlineLabelComponent } from './transactions/transaction-labels/add-inline-label.component';
import { TransactionLabelsComponent } from './transactions/transaction-labels/transaction-labels.component';
import { TransactionsComponent } from './transactions/transactions.component';
import { WelcomeComponent } from './welcome/welcome.component';
import { DialogViewImportedRowComponent } from './transactions/dialog-view-imported-row/dialog-view-imported-row.component';

const appRoutes: Routes = [
  { path: 'overview', component: AccountsComponent, data: { title: 'Overview' } },
  { path: 'transactions', component: TransactionsComponent, data: { title: 'Transactions' } },
  { path: 'labels', component: LabelsComponent, data: { title: 'Labels' } },
  { path: 'rules', component: RulesComponent, data: { title: 'Rules' } },
  { path: 'analytics', component: AnalyticsComponent, data: { title: 'Analytics' } },
  { path: 'comments', component: CommentsComponent, data: { title: 'Comments' } },
  { path: 'settings', component: SettingsComponent, data: { title: 'Settings' } },
  { path: '', pathMatch: 'full', redirectTo: 'overview' }
];

@NgModule({
  imports: [
    CommonModule,
    RouterModule.forRoot(appRoutes),
    KeyboardShortcutsModule.forRoot(),
    FormsModule,
    NgStackFormsModule,
    HttpClientModule,
    MaterialModule,
  ],
  declarations: [
    MoneyComponent,
    AnalyticsComponent,
    ImportFileComponent,
    TransactionEditComponent,
    TransactionsComponent,
    TransactionLabelsComponent,
    AddInlineLabelComponent,
    DialogDeleteWithOrphansComponent,
    DialogSplitTransactionComponent,
    SettingsComponent,
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
    AccountsComponent,
    AccountEditComponent,
    BalancesComponent,
    BankSyncComponent,
    PresetsComponent,
    WelcomeComponent,
    DialogViewImportedRowComponent,
  ],
  entryComponents: [
    ImportFileComponent,
    AccountEditComponent,
    BalancesComponent,
    TransactionEditComponent,
    RuleEditComponent,
    DialogDeleteWithOrphansComponent,
    DialogSplitTransactionComponent,
    DialogLabelDominanceComponent,
    DialogStaleDataComponent,
    WelcomeComponent,
  ],
  exports: [
    MoneyComponent,
  ],
})
export class MoneyModule { }
