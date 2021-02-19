import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import * as moment from 'moment';
import { BehaviorSubject, combineLatest, Subscription } from 'rxjs';
import { debounceTime, map } from 'rxjs/operators';
import { getPaletteColor } from 'src/app/core/color-util';
import { LoggerService } from 'src/app/core/logger.service';
import { observeFragment } from 'src/app/core/router-util';
import { escapeQuotedString, escapeRegex, nested2ToSet, nested3ToSet, sortBy, splitQuotedString, traverseTree } from 'src/app/core/util';
import { BillingInfo, BillingType, Transaction, TransactionData } from '../../../proto/model';
import { KeyedArrayAggregate, KeyedNumberAggregate } from '../../core/keyed-aggregate';
import { momentToProtoDate, protoDateToMoment } from '../../core/proto-util';
import { BillingService, CanonicalBillingInfo } from '../billing.service';
import { CurrencyService } from '../currency.service';
import { DataService } from '../data.service';
import { DialogService } from '../dialog.service';
import { FilterState } from '../filter-input/filter-state';
import { LabelHierarchyNode, LabelService } from '../label.service';
import { extractAllLabels, getDominantLabels, getTransactionAmount, MONEY_EPSILON } from '../model-util';
import { TransactionFilterService } from '../transaction-filter.service';
import { LabelDominanceOrder } from './dialog-label-dominance/dialog-label-dominance.component';
import { AnalysisResult, BilledTransaction, BucketInfo, BucketUnit, isBucketUnit, NONE_GROUP_NAME, OTHER_GROUP_NAME } from './types';

const DEFAULT_BUCKET_UNIT = 'month';
const BUCKET_TOTAL_BY_LABEL_PROPS = ['totalExpensesByLabel', 'totalIncomeByLabel'] as const;

@Component({
  selector: 'app-analytics',
  templateUrl: './analytics.component.html',
  styleUrls: ['./analytics.component.css']
})
export class AnalyticsComponent implements OnInit, OnDestroy {
  readonly filterState = new FilterState();
  readonly bucketUnitSubject = new BehaviorSubject<BucketUnit>(DEFAULT_BUCKET_UNIT);
  readonly ignoreBillingPeriodSubject = new BehaviorSubject<boolean>(false);
  readonly uncollapsedGroupsSubject = new BehaviorSubject<'all' | 'none' | Set<string>>('none');
  private readonly labelDominanceSubject = new BehaviorSubject<LabelDominanceOrder>({});
  private readonly labelGroupLimitsSubject = new BehaviorSubject<void>(void (0));

  labelGroups: LabelHierarchyNode[] = [];
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
  analysisResult: AnalysisResult = { bucketUnit: DEFAULT_BUCKET_UNIT, buckets: [], labelGroupNames: [], labelGroupColorsByName: {}, excludedLabels: [], summedTotalIncomeByLabel: new KeyedNumberAggregate(), summedTotalExpensesByLabel: new KeyedNumberAggregate() };

  private txSubscription: Subscription;
  private matchingTransactions: Transaction[] = [];
  /** The part of the current filter string that performs date filtering. */
  private dateRestrictingFilter: string | null = null;

  /**
   * Cache built from labelGroups mapping from "foo/bar" to "foo+".
   * Incomplete, only contains keys that were actually collapsed.
   */
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
    private readonly labelService: LabelService,
    private readonly billingService: BillingService,
    private readonly currencyService: CurrencyService,
    private readonly dialogService: DialogService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly loggerService: LoggerService) { }

  ngOnInit() {
    this.filterState.followFragment('q', this.route, this.router);
    observeFragment('unit', this.bucketUnitSubject.pipe(
      map(value => value === DEFAULT_BUCKET_UNIT ? '' : value)
    ), this.route, this.router)
      .subscribe(value => {
        if (!value) value = DEFAULT_BUCKET_UNIT;
        if (isBucketUnit(value)) {
          this.bucketUnitSubject.next(value);
        }
      });
    observeFragment('collapse', this.uncollapsedGroupsSubject.pipe(map(value => {
      if (value === 'none') return '';
      if (value === 'all') return 'none'; // inverted for easier outside interpretability
      return Array.from(value).sort().map(v => '!' + v).join(';');
    })), this.route, this.router)
      .subscribe(fragmentValue => {
        if (!fragmentValue) this.uncollapsedGroupsSubject.next('none');
        else if (fragmentValue === 'none') this.uncollapsedGroupsSubject.next('all');
        else {
          const labels = fragmentValue.split(';').map(v => v.replace(/^!/, ''));
          this.uncollapsedGroupsSubject.next(new Set(labels));
        }
      });

    // TODO @ZombieSubscription
    this.dataService.userSettings$
      .pipe(map(settings => settings.labelDominanceOrder))
      .subscribe(this.labelDominanceSubject);

    this.txSubscription =
      combineLatest(
        this.dataService.transactions$,
        this.filterState.value$,
        this.bucketUnitSubject,
        this.ignoreBillingPeriodSubject,
        this.uncollapsedGroupsSubject,
        this.labelDominanceSubject,
        this.labelGroupLimitsSubject)
        .pipe(debounceTime(0)) // when multiple values change at once
        .subscribe(_ => this.analyzeTransactions());
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
        : 'label=' + escapeQuotedString(label))));
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
      // Open transactions list.
      this.router.navigate(['/transactions'], { fragment: 'q=' + filter.trim() });
    } else {
      // Add label to filter on current page. Automatically uncollapse a clicked group.
      if (clickedLabels.length === 1 && clickedLabels[0].endsWith('+')) {
        this.setShouldCollapseGroup(clickedLabels[0].substr(0, clickedLabels[0].length - 1), false);
      }
      this.filterState.setValueNow(filter);
    }
  }

  /** Add date bucket to filter or navigate to transactions list when clicking on it. */
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
    this.uncollapsedGroupsSubject.next('none');
  }

  uncollapseAllGroups() {
    this.uncollapsedGroupsSubject.next('all');
  }

  shouldCollapseGroup(group: string): boolean {
    const value = this.uncollapsedGroupsSubject.value;
    if (value === 'all') return false;
    if (value === 'none') return true;
    return !value.has(group);
  }

  setShouldCollapseGroup(group: string, flag: boolean) {
    const shouldIncludeInSet = !flag; // the set tracks UNcollapsed values
    const value = this.uncollapsedGroupsSubject.value;
    let newValue: typeof value;
    if (shouldIncludeInSet) {
      if (value === 'all')
        return; // noop
      else if (value === 'none')
        newValue = new Set([group]);
      else {
        newValue = value.add(group);
      }
    }
    else {
      if (value === 'all')
        newValue = new Set(this.labelGroups.filter(g => g.fullName !== group).map(g => g.fullName));
      else if (value === 'none')
        return; // noop
      else if (value.delete(group)) {
        newValue = value;
      } else {
        return; // was not even contained, noop
      }
    }
    this.uncollapsedGroupsSubject.next(newValue);
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

  //#region Group Limit controls
  canIncreaseGroupLimit(index: number): boolean {
    return this.billedTransactionBuckets.some(b => b[BUCKET_TOTAL_BY_LABEL_PROPS[index]].get(OTHER_GROUP_NAME));
  }

  canDecreaseGroupLimit(index: number): boolean {
    return this.labelGroupLimits[index] > 3
      && nested2ToSet(this.billedTransactionBuckets.map(b => b[BUCKET_TOTAL_BY_LABEL_PROPS[index]].getKeys())).size > 3;
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

  private analyzeTransactions() {
    let tStart = performance.now();

    const filterValue = this.filterState.getCurrentValue();
    const bucketUnit = this.bucketUnitSubject.value;
    const ignoreBilling = this.ignoreBillingPeriodSubject.value;

    const allTransactions = this.dataService.getCurrentTransactionList();
    const processedFilter = this.preprocessFilter(filterValue, ignoreBilling);
    this.matchingTransactions = this.filterService.applyFilter(allTransactions, processedFilter);
    this.totalTransactionCount = allTransactions.length;
    this.matchingTransactionCount = this.matchingTransactions.length;

    this.analyzeLabelGroups();
    this.analyzeLabelsSharedByAll();
    this.analyzeBuckets(bucketUnit, ignoreBilling);
    this.analyzeLabelGroupTruncation();
    this.collectAnalysisResult(bucketUnit);

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
    this.labelGroups = [];
    this.collapsedLabelGroupNamesLookup = {};

    const fullHierarchy = this.labelService.buildHierarchyFromTransactions(this.matchingTransactions);
    traverseTree(fullHierarchy, (node, recurse) => {
      if (node.children.length > 1) {
        this.labelGroups.push(node);

        if (this.shouldCollapseGroup(node.fullName)) {
          // Build lookup cache, recursively including this entire subtree.
          traverseTree([node], descendant => {
            this.collapsedLabelGroupNamesLookup[descendant.fullName] =
              node.fullName + '+';
          });
        }
        else {
          // Explore next nesting level.
          recurse();
        }
      }
    });
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
  private analyzeBuckets(bucketUnit: BucketUnit, ignoreBilling: boolean) {
    this.hasFilteredPartiallyBilledTransactions = false;
    let passesDateFilter: (dayMoment: moment.Moment) => boolean;
    if (this.dateRestrictingFilter) {
      const filterPredicate = this.filterService.makeFilterPredicate(this.dateRestrictingFilter);
      // Prepare a fake transaction used to check if a certain day passes the date filter.
      const dummyBilling = new BillingInfo({ periodType: BillingType.DAY });
      const dummyTransaction = new Transaction({ billing: dummyBilling, single: new TransactionData() });
      passesDateFilter = (dayMoment: moment.Moment) => {
        dummyBilling.date = momentToProtoDate(dayMoment);
        return filterPredicate(dummyTransaction);
      }
    } else {
      passesDateFilter = () => true;
    }

    const keyFormatsByBillingType: { [K in BillingType.DAY | BillingType.MONTH | BillingType.YEAR]: string } = {
      [BillingType.DAY]: 'YYYY-MM-DD',
      [BillingType.MONTH]: 'YYYY-MM',
      [BillingType.YEAR]: 'YYYY',
    };
    const unitsByBillingType: { [K in BillingType.DAY | BillingType.MONTH | BillingType.YEAR]: BucketUnit } = {
      [BillingType.DAY]: 'day',
      [BillingType.MONTH]: 'month',
      [BillingType.YEAR]: 'year',
    };

    let keyFormat: string;
    // Note: Do NOT directly use bucket unit as input for a moment's "granularity",
    // since there we need to pass 'isoWeek' instead of 'week'! For add/subtract,
    // using 'week' is fine, though.
    switch (bucketUnit) {
      case 'day': keyFormat = 'YYYY-MM-DD'; break;
      case 'week': keyFormat = 'GGGG-[W]WW'; break;
      case 'month': keyFormat = 'YYYY-MM'; break;
      case 'year': keyFormat = 'YYYY'; break;
      default: throw new Error('unknown bucket unit: ' + bucketUnit);
    }

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
        try { billing = this.billingService.resolveTransactionCanonicalBilling(transaction, labelDominanceOrder); }
        finally {
          transaction.billing = origValues.billing;
          transaction.labels = origValues.labels;
        }
      }
      else {
        billing = this.billingService.resolveTransactionCanonicalBilling(transaction, labelDominanceOrder);
      }

      // Skip transactions that are excluded from billing.
      if (billing.periodType === BillingType.NONE) {
        continue;
      }

      // billing.periodType determines which billing buckets this transaction amount should be evenly distributed across.
      // Then, within billing buckets, the amount is evenly distributed across all contained days.
      // This is relevant if the unit is months and years, which can have different number of days.
      // The distribution to days is necessary in case there is a day-specific filter active,
      // which may be finer than the configured dateUnit to view buckets in.

      const fromMoment = protoDateToMoment(billing.date);
      const toMoment = protoDateToMoment(billing.endDate);

      const billingKeyFormat = keyFormatsByBillingType[billing.periodType];
      const billingBucketUnit = unitsByBillingType[billing.periodType];
      const contributingBillingBuckets: moment.Moment[] = [];
      // Iterate over billing buckets and collect their moments.
      // Start with the normalized version of fromMoment (e.g. for months, 2018-05-22 is turned into 2018-05-01).
      const it = moment(fromMoment.format(billingKeyFormat), billingKeyFormat);
      while (it.isSameOrBefore(toMoment)) {
        contributingBillingBuckets.push(it.clone());
        it.add(1, billingBucketUnit);
      }
      debugContribHistogram.add(contributingBillingBuckets.length + "", 1);

      const txAmount = getTransactionAmount(transaction, this.dataService, this.currencyService);
      const amountPerBillingBucket = txAmount / contributingBillingBuckets.length;
      const amountsByViewBucket = new KeyedNumberAggregate();
      for (const itBucket of contributingBillingBuckets) {
        // Distribute each bucket's amount share evenly across all individual days.
        // Map individual days to the requested bucket key format and gather total amounts for this tx.
        const numDays = itBucket.clone().add(1, billingBucketUnit).diff(itBucket, 'days');
        const amountPerDay = amountPerBillingBucket / numDays;
        const itDay = itBucket.clone();
        for (let i = 0; i < numDays; i++) {
          if (passesDateFilter(itDay)) {
            amountsByViewBucket.add(itDay.format(keyFormat), amountPerDay);
          } else {
            this.hasFilteredPartiallyBilledTransactions = true;
          }
          itDay.add(1, 'day');
        }
      }

      // Resolve dominant label(s) and label grouping for this transaction.
      // Group number truncation to <other> happens in a *separate* step, because
      // we need to sort by how much money each label group accounts for (+ and -).
      const dominantLabels = getDominantLabels(transaction.labels, labelDominanceOrder, this.labelsSharedByAll);
      const label = dominantLabels.length === 0 ? NONE_GROUP_NAME : dominantLabels
        // Note that a label actually named "foo+" collides with grouped "foo/bar", but it is a quite unlikely naming convention,
        // so this risk is accepted here.
        .map(label => this.collapsedLabelGroupNamesLookup[label] || label)
        .join(',');

      // Finally create the BilledTransaction entry for each affected bucket.
      for (const [key, amount] of amountsByViewBucket.getEntries()) {
        billedTxsByBucket.add(key, {
          source: transaction,
          amount,
          labelGroupName: label,
        });
      }
    }
    this.loggerService.debug("stats of # of billed buckets", debugContribHistogram.getEntries());

    // Fill holes in buckets with empty buckets.
    // Sort the keys alphanumerically as the keyFormat is big-endian.
    const sortedKeys = billedTxsByBucket.getKeys().sort();
    if (sortedKeys.length > 1) {
      const last = sortedKeys[sortedKeys.length - 1];
      const it = moment(sortedKeys[0]);
      while (it.isBefore(last)) {
        it.add(1, bucketUnit);
        // Make sure each date unit (e.g. month) is represented as a bucket.
        billedTxsByBucket.addMany(it.format(keyFormat), []);
      }
    }

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

  /**
   * Checks group limits and reduces excess label groups to the "other" group.
   * Modifies this.billedTransactionBuckets directly.
   * Also fills in totalsByLabel per bucket.
   */
  private analyzeLabelGroupTruncation() {
    let i = 0;
    for (const aggregateProp of BUCKET_TOTAL_BY_LABEL_PROPS) {
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
  private collectAnalysisResult(bucketUnit: BucketUnit) {
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
      bucketUnit,
      labelGroupNames: Array.from(labelGroupNamesSet),
      labelGroupColorsByName,
      buckets: this.billedTransactionBuckets,
      excludedLabels: this.labelsSharedByAll,
      summedTotalIncomeByLabel,
      summedTotalExpensesByLabel,
    };
  }

  private assignLabelGroupColor(name: string): string {
    if (this.labelGroupColorsCache.hasOwnProperty(name)) {
      return this.labelGroupColorsCache[name];
    }
    // <other> gets special treatment.
    if (name === OTHER_GROUP_NAME) {
      return this.labelGroupColorsCache[name] = '#666666';
    }
    // Explicit user-defined color if available.
    const labelConfig = this.dataService.getLabelConfig(
      name.endsWith('+') ? name.substr(0, name.length - 1) : name);
    if (labelConfig && labelConfig.displayColor) {
      return this.labelGroupColorsCache[name] = labelConfig.displayColor;
    }

    // Otherwise use random palette.
    const nextIndex = Object.keys(this.labelGroupColorsCache).length;
    return this.labelGroupColorsCache[name] = getPaletteColor(nextIndex);
  }

}
