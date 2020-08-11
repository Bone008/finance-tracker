import { KeyedNumberAggregate } from 'src/app/core/keyed-aggregate';
import { Transaction } from 'src/proto/model';

/** The character that is used in label names to define a hierarchy. */
export const LABEL_HIERARCHY_SEPARATOR = '/';
export const NONE_GROUP_NAME = '<none>';
export const OTHER_GROUP_NAME = '<other>';

export const ALL_BUCKET_UNITS = ['day', 'week', 'month', 'year'] as const;
export type BucketUnit = typeof ALL_BUCKET_UNITS[number];
export function isBucketUnit(input: string): input is BucketUnit {
  return (<readonly string[]>ALL_BUCKET_UNITS).includes(input);
}

/** Provides data about a label with sublabels (induced label hierarchy). */
export interface LabelGroup {
  parentName: string;
  children: string[];
}

/** Contains data about a transcation billed to a specific date bucket. */
export interface BilledTransaction {
  source: Transaction;
  /** Contribution amount of transaction in main currency. */
  amount: number;
  /**
   * Resolved value of the grouped dominant label(s) that are not excluded, or a fallback value if unlabeled.
   * This does NOT currently reflect truncation, so will never contain <other>.
   */
  labelGroupName: string;
}

/** Contains all relevant data about a date bucket. */
export interface BucketInfo {
  /** The bucket name, for example in the format YYYY-MM. */
  name: string;
  billedTransactions: BilledTransaction[];
  totalIncome: number;
  totalIncomeByLabel: KeyedNumberAggregate;
  totalExpenses: number;
  totalExpensesByLabel: KeyedNumberAggregate;
}

/** Contains all relevant data and metadata about the analysis result. */
export interface AnalysisResult {
  /** Raw view of all transactions that matched the filter. */
  matchingTransactions: Transaction[];
  /** Mapping from full label names to their possibly collapsed version. */
  collapsedLabelGroupNamesLookup: { [fullLabel: string]: string };

  /** Which date unit is used for date buckets. */
  bucketUnit: BucketUnit;
  /** All appearing label groups in arbitrary order. */
  labelGroupNames: string[];
  /** Mapping from label groups to their assigned colors. */
  labelGroupColorsByName: { [labelGroupName: string]: string };
  /** Raw label names that were ignored because they appear in all transactions. */
  excludedLabels: string[];
  /** Sorted date buckets with detailed information. */
  buckets: BucketInfo[];

  /** The values of totalIncomeByLabel of each bucket summed into one aggregate. */
  summedTotalIncomeByLabel: KeyedNumberAggregate;
  /** The values of totalExpensesByLabel of each bucket summed into one aggregate. */
  summedTotalExpensesByLabel: KeyedNumberAggregate;
}
