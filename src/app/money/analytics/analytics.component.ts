import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import * as moment from 'moment';
import { BehaviorSubject, combineLatest, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { getPaletteColor } from 'src/app/core/color-util';
import { LoggerService } from 'src/app/core/logger.service';
import { escapeRegex, nested2ToSet, nested3ToSet, sortBy, splitQuotedString } from 'src/app/core/util';
import { BillingInfo, BillingType, Transaction, TransactionData } from '../../../proto/model';
import { KeyedArrayAggregate, KeyedNumberAggregate } from '../../core/keyed-aggregate';
import { momentToProtoDate, protoDateToMoment } from '../../core/proto-util';
import { CurrencyService } from '../currency.service';
import { DataService } from '../data.service';
import { DialogService } from '../dialog.service';
import { FilterState } from '../filter-input/filter-state';
import { CanonicalBillingInfo, extractAllLabels, getDominantLabels, getTransactionAmount, MONEY_EPSILON, resolveTransactionCanonicalBilling } from '../model-util';
import { TransactionFilterService } from '../transaction-filter.service';
import { LabelDominanceOrder } from './dialog-label-dominance/dialog-label-dominance.component';
import { AnalysisResult, BilledTransaction, BucketInfo, LabelGroup, LABEL_HIERARCHY_SEPARATOR, NONE_GROUP_NAME, OTHER_GROUP_NAME } from './types';

@Component({
  selector: 'app-analytics',
  templateUrl: './analytics.component.html',
  styleUrls: ['./analytics.component.css']
})
export class AnalyticsComponent implements OnInit, OnDestroy {
  private readonly bucketTotalByLabelProps = ['totalExpensesByLabel', 'totalIncomeByLabel'] as const;

  readonly filterState = new FilterState();
  readonly ignoreBillingPeriodSubject = new BehaviorSubject<boolean>(false);
  readonly labelCollapseSubject = new BehaviorSubject<void>(void (0));
  private readonly labelDominanceSubject = new BehaviorSubject<LabelDominanceOrder>({});
  private readonly labelGroupLimitsSubject = new BehaviorSubject<void>(void (0));

  private static readonly uncollapsedLabels = new Set<string>();
  // TODO: Refactor this into a "LabelGroupService" that abstracts & persists the storage of this.
  labelGroups: LabelGroup[] = [];
  totalTransactionCount = 0;
  matchingTransactionCount = 0;
  hasFilteredPartiallyBilledTransactions = false;

  /** List of labels that are shared by all matching transactions. */
  labelsSharedByAll: string[] = [];

  /**
   * Main output of the transaction preprocessing. Contains filtered transactions
   * billed to and split across their respective date buckets as well as grouped
   * and truncated label groups.
   * Subcomponents can further process this dataset.
   */
  analysisResult: AnalysisResult = { buckets: [], labelGroupNames: [], labelGroupColorsByName: {}, excludedLabels: [], summedTotalIncomeByLabel: new KeyedNumberAggregate(), summedTotalExpensesByLabel: new KeyedNumberAggregate() };

  private txSubscription: Subscription;
  private matchingTransactions: Transaction[] = [];
  /** The part of the current filter string that performs date filtering. */
  private dateRestrictingFilter: string | null = null;

  // Cache built from labelGroups mapping from "foo/bar" to "foo+".
  private collapsedLabelGroupNamesLookup: { [fullLabel: string]: string } = {};
  /** Preprocessed buckets. */
  private billedTransactionBuckets: BucketInfo[] = [];
  /** Label group colors, NOT cleared across recalculations for consistency. */
  private labelGroupColorsCache: { [label: string]: string } = {};

  /** Maximum number of label groups to use before truncating. */
  private labelGroupLimits: [number, number] = [6, 6];

  constructor(
    private readonly dataService: DataService,
    private readonly filterService: TransactionFilterService,
    private readonly currencyService: CurrencyService,
    private readonly dialogService: DialogService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly loggerService: LoggerService) { }

  ngOnInit() {
    this.filterState.followFragment(this.route, this.router);

    // TODO @ZombieSubscription
    this.dataService.userSettings$
      .pipe(map(settings => settings.labelDominanceOrder))
      .subscribe(this.labelDominanceSubject);

    this.labelCollapseSubject.subscribe(() => this.refreshUncollapsedLabels());

    this.txSubscription =
      combineLatest(
        this.dataService.transactions$,
        this.filterState.value$,
        this.ignoreBillingPeriodSubject,
        this.labelCollapseSubject,
        this.labelDominanceSubject,
        this.labelGroupLimitsSubject)
        .subscribe(([_, filterValue, ignoreBilling]) => this.analyzeTransactions(filterValue, ignoreBilling));
  }

  ngOnDestroy() {
    this.txSubscription.unsubscribe();
  }

  /** Add label(s) to filter or navigate to transactions when clicking on them. */
  onLabelGroupClick(clickedLabels: string[], isAltClick: boolean) {
    // TODO Refactor token operations into some utility method.
    const addedTokens = (clickedLabels.length === 0
      ? ['-label:.']
      : clickedLabels.map(label => (label.endsWith('+')
        ? 'label:^' + escapeRegex(label.substring(0, label.length - 1))
        : 'label=' + label)));
    let filter = this.filterState.getCurrentValue();
    for (const newToken of addedTokens) {
      if (filter.length > 0) {
        if (filter.includes(newToken)) {
          continue; // Don't add duplicate tokens (best effort matching).
        }
        filter += " " + newToken;
      } else {
        filter = newToken;
      }
    }

    if (isAltClick) {
      this.router.navigate(['/transactions'], { fragment: 'q=' + filter });
    } else {
      this.filterState.setValueNow(filter);
    }
  }

  /** Add month to filter or navigate to transactions when clicking on it. */
  onChartBucketClick(bucketName: string, isAltClick: boolean) {
    // TODO Refactor token operations into some utility method.
    const addedToken = 'date:' + bucketName;
    let filter = this.filterState.getCurrentValue();
    if (!filter.includes(addedToken)) {
      if (filter.length > 0) {
        filter += " " + addedToken;
      } else {
        filter = addedToken;
      }
    }

    if (isAltClick) {
      this.router.navigate(['/transactions'], { fragment: 'q=' + filter });
    } else {
      this.filterState.setValueNow(filter);
    }
  }

  collapseAllGroups() {
    AnalyticsComponent.uncollapsedLabels.clear();
    this.labelGroups.forEach(group => group.shouldCollapse = true);
    // Note: Do not remove void param as compiler will complain even though
    // IDE says it is fine.
    this.labelCollapseSubject.next(void (0));
  }

  uncollapseAllGroups() {
    this.labelGroups.forEach(group => group.shouldCollapse = false);
    this.labelCollapseSubject.next(void (0));
  }

  openLabelDominanceDialog() {
    const originalDominanceOrder = this.labelDominanceSubject.getValue();
    const dominanceOrder = Object.assign({}, originalDominanceOrder);

    this.dialogService.openAnalyticsLabelDominance(dominanceOrder)
      .afterConfirmed().subscribe(() => {
        this.dataService.getUserSettings().labelDominanceOrder = dominanceOrder;
        this.labelDominanceSubject.next(dominanceOrder);
      });
  }

  private refreshUncollapsedLabels() {
    for (const group of this.labelGroups) {
      if (group.shouldCollapse) {
        AnalyticsComponent.uncollapsedLabels.delete(group.parentName);
      } else {
        AnalyticsComponent.uncollapsedLabels.add(group.parentName);
      }
    }
  }

  //#region Group Limit controls
  canIncreaseGroupLimit(index: number): boolean {
    return this.billedTransactionBuckets.some(b => b[this.bucketTotalByLabelProps[index]].get(OTHER_GROUP_NAME));
  }

  canDecreaseGroupLimit(index: number): boolean {
    return this.labelGroupLimits[index] > 3
      && nested2ToSet(this.billedTransactionBuckets.map(b => b[this.bucketTotalByLabelProps[index]].getKeys())).size > 3;
  }

  increaseGroupLimit(index: number) {
    this.labelGroupLimits[index] += 3;
    this.labelGroupLimitsSubject.next();
  }

  decreaseGroupLimit(index: number) {
    this.labelGroupLimits[index] = Math.max(3, this.labelGroupLimits[index] - 3);
    this.labelGroupLimitsSubject.next();
  }
  //#endregion

  private analyzeTransactions(filterValue: string, ignoreBilling: boolean) {
    let tStart = performance.now();

    const allTransactions = this.dataService.getCurrentTransactionList();
    const processedFilter = this.preprocessFilter(filterValue, ignoreBilling);
    this.matchingTransactions = this.filterService.applyFilter(allTransactions, processedFilter);
    this.totalTransactionCount = allTransactions.length;
    this.matchingTransactionCount = this.matchingTransactions.length;

    this.analyzeLabelGroups();
    this.analyzeLabelsSharedByAll();
    this.analyzeBuckets(ignoreBilling);
    this.analyzeLabelGroupTruncation();
    this.collectAnalysisResult();

    let tEnd = performance.now();
    this.loggerService.debug(`analyzeTransactions: ${tEnd - tStart} ms for ${this.matchingTransactionCount} transactions`);
  }

  /** Replaces 'date' filter tokens with 'billing' tokens and updates this.dateRestrictingFilter accordingly. */
  private preprocessFilter(filterValue: string, ignoreBilling: boolean): string {
    this.dateRestrictingFilter = null;

    if (ignoreBilling) {
      return filterValue;
    }
    // TODO make operating on individual filter tokens nicer :(
    const tokens = splitQuotedString(filterValue);
    const dateTokenRegex = /^(-?)date(:|=|<=?|>=?)/;
    const dateTokens: string[] = [];
    const processed = tokens.map(token => {
      if (dateTokenRegex.test(token)) {
        token = token.replace('date', 'billing');
        dateTokens.push('"' + token + '"');
      }
      return '"' + token + '"';
    }).join(' ');

    if (dateTokens.length > 0) {
      this.dateRestrictingFilter = dateTokens.join(' ');
    }

    return processed;
  }

  /**
   * Computes the list of parent labels that have sublabels and their collapsed
   * state and stores it into this.labelGroups.
   **/
  private analyzeLabelGroups() {
    const labels = extractAllLabels(this.matchingTransactions);
    const parentLabels = new KeyedArrayAggregate<string>();
    for (const label of labels) {
      if (this.dataService.getLabelBilling(label).periodType === BillingType.NONE) {
        continue;
      }

      const sepIndex = label.indexOf(LABEL_HIERARCHY_SEPARATOR);
      if (sepIndex > 0) {
        parentLabels.add(label.substr(0, sepIndex), label.substr(sepIndex + 1));
      } else {
        // Just a regular label, but it may be a parent to some other children.
        parentLabels.add(label, label);
      }
    }

    this.labelGroups = parentLabels.getEntriesSorted()
      .filter(([_, children]) => children.length > 1)
      .map(([parentName, children]) => <LabelGroup>{
        parentName,
        children,
        shouldCollapse: !AnalyticsComponent.uncollapsedLabels.has(parentName),
      });

    // Build cache.
    this.collapsedLabelGroupNamesLookup = {};
    const lookup = this.collapsedLabelGroupNamesLookup;
    for (const group of this.labelGroups) {
      if (group.shouldCollapse) {
        lookup[group.parentName] = group.parentName + '+';
        for (const child of group.children) {
          lookup[group.parentName + LABEL_HIERARCHY_SEPARATOR + child] = group.parentName + '+';
        }
      }
    }
  }

  /** Find labels which every matched transaction is tagged with and store it in this.labelsSharedByAll. */
  private analyzeLabelsSharedByAll() {
    // Note that this includes transactions with billing=None. But billing is only
    // applied afterwards when assigning buckets, which is also where the excluded
    // labels are needed. So for simplicity we accept this inaccuracy.
    this.labelsSharedByAll = extractAllLabels(this.matchingTransactions)
      .filter(label => this.matchingTransactions.every(transaction => transaction.labels.includes(label)));
  }

  /** Splits transactions into date buckets according to billing settings and stores them in this.billedTransactionBuckets. */
  private analyzeBuckets(ignoreBilling: boolean) {
    const displayUnit = 'month';
    const keyFormat = 'YYYY-MM';

    const labelDominanceOrder = this.dataService.getUserSettings().labelDominanceOrder;
    const billedTxsByBucket = new KeyedArrayAggregate<BilledTransaction>();

    const debugContribHistogram = new KeyedNumberAggregate();
    for (const transaction of this.matchingTransactions) {
      let billing: CanonicalBillingInfo;
      if (ignoreBilling) {
        // Hack: To ignore billing, temporarily clear fields of transaction.
        const origValues = { billing: transaction.billing, labels: transaction.labels };
        transaction.billing = null;
        transaction.labels = [];
        try { billing = resolveTransactionCanonicalBilling(transaction, this.dataService, labelDominanceOrder); }
        finally {
          transaction.billing = origValues.billing;
          transaction.labels = origValues.labels;
        }
      }
      else {
        billing = resolveTransactionCanonicalBilling(transaction, this.dataService, labelDominanceOrder);
      }

      // Skip transactions that are excluded from billing.
      if (billing.periodType === BillingType.NONE) {
        continue;
      }

      const fromMoment = protoDateToMoment(billing.date);
      const toMoment = protoDateToMoment(billing.endDate);
      const contributingKeys: string[] = [];
      // Iterate over date units and collect their keys.
      // Start with the normalized version of fromMoment (e.g. for months,
      // 2018-05-22 is turned into 2018-05-01).
      const it = moment(fromMoment.format(keyFormat), keyFormat);
      while (it.isSameOrBefore(toMoment)) {
        contributingKeys.push(it.format(keyFormat));
        it.add(1, displayUnit);
      }
      debugContribHistogram.add(contributingKeys.length + "", 1);

      const txAmount = getTransactionAmount(transaction, this.dataService, this.currencyService);
      // TODO: For DAY billing granularity, we may want to consider proportional contributions to the months.
      const amountPerBucket = txAmount / contributingKeys.length;

      // Resolve dominant label(s) and label grouping for this transaction.
      // Group number truncation to <other> happens in a *separate* step, because
      // we need to sort by how much money each label group accounts for (+ and -).
      const dominantLabels = getDominantLabels(transaction.labels, labelDominanceOrder, this.labelsSharedByAll);
      const label = dominantLabels.length === 0 ? NONE_GROUP_NAME : dominantLabels
        // TODO A label actually named "foo+" collides with grouped "foo/bar", but it is a quite unlikely naming convention.
        .map(label => this.collapsedLabelGroupNamesLookup[label] || label)
        .join(',');

      for (const key of contributingKeys) {
        billedTxsByBucket.add(key, {
          source: transaction,
          amount: amountPerBucket,
          labelGroupName: label,
        });
      }
    }

    this.loggerService.debug("stats of # of billed months", debugContribHistogram.getEntries());

    // Fill holes in buckets with empty buckets.
    // Sort the keys alphanumerically as the keyFormat is big-endian.
    const sortedKeys = billedTxsByBucket.getKeys().sort();
    if (sortedKeys.length > 1) {
      const last = sortedKeys[sortedKeys.length - 1];
      const it = moment(sortedKeys[0]);
      while (it.isBefore(last)) {
        it.add(1, displayUnit);
        // Make sure each date unit (e.g. month) is represented as a bucket.
        billedTxsByBucket.addMany(it.format(keyFormat), []);
      }
    }
    this.cleanBucketsByDateFilter(billedTxsByBucket);

    this.billedTransactionBuckets = billedTxsByBucket.getEntriesSorted().map(([name, billedTransactions]) => {
      const positive = billedTransactions.filter(t => t.amount > MONEY_EPSILON);
      const negative = billedTransactions.filter(t => t.amount < -MONEY_EPSILON);
      const totalsByLabelPositive = new KeyedNumberAggregate();
      const totalsByLabelNegative = new KeyedNumberAggregate();
      positive.forEach(t => { totalsByLabelPositive.add(t.labelGroupName, t.amount); });
      negative.forEach(t => { totalsByLabelNegative.add(t.labelGroupName, t.amount); });
      const bucket: BucketInfo = {
        name,
        billedTransactions,
        totalIncome: positive.map(t => t.amount).reduce((a, b) => a + b, 0),
        totalExpenses: negative.map(t => t.amount).reduce((a, b) => a + b, 0),
        totalIncomeByLabel: totalsByLabelPositive,
        totalExpensesByLabel: totalsByLabelNegative,
      };
      return bucket;
    });
  }

  // TODO: This is specialized to MONTH view, make sure to change once other granularities are supported.
  private cleanBucketsByDateFilter(billedBuckets: KeyedArrayAggregate<BilledTransaction>) {
    this.hasFilteredPartiallyBilledTransactions = false;

    if (!this.dateRestrictingFilter) {
      return;
    }
    // Create a fake transaction that is billed during the bucket's month
    // and check if it would pass the date filter.
    const dummyBilling = new BillingInfo({ periodType: BillingType.MONTH });
    const dummyTransaction = new Transaction({ billing: dummyBilling, single: new TransactionData() });
    for (const [key, billedTransactions] of billedBuckets.getEntries()) {
      const keyMoment = moment(key);
      dummyBilling.date = momentToProtoDate(keyMoment);
      if (!this.filterService.matchesFilter(dummyTransaction, this.dateRestrictingFilter)) {
        // This bucket does not pass the filter.
        billedBuckets.delete(key);
        this.hasFilteredPartiallyBilledTransactions = true;
      }
    }
  }

  /**
   * Checks group limits and reduces excess label groups to the "other" group.
   * Modifies this.billedTransactionBuckets directly.
   * Also fills in totalsByLabel per bucket.
   */
  private analyzeLabelGroupTruncation() {
    let i = 0;
    for (const aggregateProp of this.bucketTotalByLabelProps) {
      // Reduce all buckets to one total sum for each label group.
      // We need this to sort by a label group's total "weight".
      // This is equivalent to the final value of analysisResult.summedTotal(Expenses|Income)ByLabel,
      // but before applying truncation.
      const summedTotalByLabel = new KeyedNumberAggregate();
      for (const bucket of this.billedTransactionBuckets) {
        summedTotalByLabel.merge(bucket[aggregateProp]);
      }

      const groupLimit = this.labelGroupLimits[i++];
      if (summedTotalByLabel.length > groupLimit) {
        // Sort descending by absolute value.
        const sortedEntries = sortBy(summedTotalByLabel.getEntries(), ([_, amount]) => Math.abs(amount), 'desc');
        // If groupLimit is n, retain the first n-1 groups and make the last group <other>.
        const groupsToTruncate = sortedEntries.slice(groupLimit - 1).map(([name, _]) => name);

        // Replace the aggregate value of each truncated group in each bucket with <other>.
        for (const bucket of this.billedTransactionBuckets) {
          const aggregate = bucket[aggregateProp];

          let otherAmount = 0;
          for (const name of groupsToTruncate) {
            const amount = aggregate.get(name);
            if (amount !== null) {
              aggregate.delete(name);
              otherAmount += amount;
            }
          }
          if (otherAmount !== 0) {
            aggregate.add(OTHER_GROUP_NAME, otherAmount);
          }
        }
      }
    }
  }

  /** Gathers results of all previous steps into this.analysisResult. */
  private collectAnalysisResult() {
    // Extract all unique label groups appearing in any bucket and assign colors.
    const labelGroupNamesSet = nested3ToSet(this.billedTransactionBuckets.map(
      b => [b.totalIncomeByLabel.getKeys(), b.totalExpensesByLabel.getKeys()]));
    const labelGroupColorsByName: { [name: string]: string } = {};
    for (const name of labelGroupNamesSet) {
      labelGroupColorsByName[name] = this.assignLabelGroupColor(name);
    }

    // Recompute the total sums across buckets.
    const summedTotalIncomeByLabel = new KeyedNumberAggregate();
    const summedTotalExpensesByLabel = new KeyedNumberAggregate();
    for (const bucket of this.billedTransactionBuckets) {
      summedTotalIncomeByLabel.merge(bucket.totalIncomeByLabel);
      summedTotalExpensesByLabel.merge(bucket.totalExpensesByLabel);
    }

    this.analysisResult = {
      labelGroupNames: Array.from(labelGroupNamesSet),
      labelGroupColorsByName,
      buckets: this.billedTransactionBuckets,
      excludedLabels: this.labelsSharedByAll,
      summedTotalIncomeByLabel,
      summedTotalExpensesByLabel,
    };
  }

  private assignLabelGroupColor(name: string): string {
    if (!this.labelGroupColorsCache.hasOwnProperty(name)) {
      const nextIndex = Object.keys(this.labelGroupColorsCache).length;
      this.labelGroupColorsCache[name] = name === OTHER_GROUP_NAME
        ? '#666666'
        : getPaletteColor(nextIndex);
    }
    return this.labelGroupColorsCache[name];
  }

}
