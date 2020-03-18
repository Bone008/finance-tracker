import { KeyedNumberAggregate } from 'src/app/core/keyed-aggregate';
import { Transaction } from 'src/proto/model';

/** The character that is used in label names to define a hierarchy. */
export const LABEL_HIERARCHY_SEPARATOR = '/';
export const NONE_GROUP_NAME = '<none>';
export const OTHER_GROUP_NAME = '<other>';


/** Provides data about a label with sublabels (induced label hierarchy). */
export interface LabelGroup {
  parentName: string;
  children: string[];
  shouldCollapse: boolean;
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
