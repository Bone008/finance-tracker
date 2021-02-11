import { Injectable } from '@angular/core';
import { Transaction } from 'src/proto/model';
import { KeyedArrayAggregate } from '../core/keyed-aggregate';
import { LoggerService } from '../core/logger.service';
import { DataService } from './data.service';
import { extractAllLabelsSet, isValidBilling, removeLabelFromTransaction, sanitizeLabelName } from './model-util';
import { RuleService } from './rule.service';

/** The character that is used in label names to define a hierarchy. */
export const LABEL_HIERARCHY_SEPARATOR = '/';

/** A generic node in the label hierarchy tree. */
export interface LabelHierarchyNode {
  /** Full name of this label. */
  fullName: string;
  localName: string;
  children: LabelHierarchyNode[];
}

@Injectable({
  providedIn: 'root'
})
export class LabelService {
  constructor(
    private readonly ruleService: RuleService,
    private readonly dataService: DataService,
    private readonly logger: LoggerService,
  ) { }

  /** Creates a label hierarchy from all labels of all transactions. */
  buildHierarchyFromAll(): LabelHierarchyNode[] {
    return this.buildHierarchyFromLabels(this.dataService.getAllLabelsSet());
  }

  /** Creates a label hierarchy from a given list of transactions. */
  buildHierarchyFromTransactions(transactions: Iterable<Transaction>): LabelHierarchyNode[] {
    return this.buildHierarchyFromLabels(extractAllLabelsSet(transactions));
  }

  /** Creates a label hierarchy from a given list of labels. */
  buildHierarchyFromLabels(labels: Iterable<string>): LabelHierarchyNode[] {
    return this._buildHierarchyFor(labels, '');
  }

  private _buildHierarchyFor(labels: Iterable<string>, prefix: string) {
    const parentLabels = new KeyedArrayAggregate<string>();
    for (const label of labels) {
      const sepIndex = label.indexOf(LABEL_HIERARCHY_SEPARATOR);
      if (sepIndex > 0) {
        parentLabels.add(label.substr(0, sepIndex), label.substr(sepIndex + 1));
      } else {
        // Just a regular label, but it may be a parent to some other children.
        parentLabels.add(label, label);
      }
    }

    return parentLabels.getEntriesSorted()
      .map(([name, children]) => ({
        fullName: prefix + name,
        localName: name,
        children: this._buildHierarchyFor(
          children.filter(child => child !== name),
          prefix + name + LABEL_HIERARCHY_SEPARATOR),
      }));
  }

  /**
   * Renames a single label (without considering its children), updating all
   * known occurences throughout the database.
   * 
   * @param oldName case-sensitive original label name
   * @param newName case-sensitive new label name, must already be sanitized!
   * @returns whether renaming was successful, and whether a merge was performed
   */
  renameLabel(oldName: string, newName: string): { success: boolean, didMerge?: boolean } {
    if (sanitizeLabelName(newName) !== newName) {
      throw new Error('newName in renameLabel must already be sanitized!');
    }
    if (newName === oldName) {
      return { success: false };
    }
    this.logger.debug('renaming:', oldName, '->', newName);

    const isMerge = this.dataService.getAllLabelsSet().has(newName);
    if (isMerge && !confirm(`The label "${newName}" already exists. If you continue, it will be merged with "${oldName}". `
      + `Transactions will no longer be distinguishable.\n\n`
      + `This cannot be undone! Do you want to continue?`)) {
      return { success: false };
    }

    // Replace value in all transactions. Do not use addLabelToTransaction,
    // since that would change ordering.
    for (const tx of this.dataService.getCurrentTransactionList()) {
      const i = tx.labels.indexOf(oldName);
      if (i >= 0) {
        tx.labels[i] = newName;
      }
    }

    // Migrate config to new key.
    const config = this.dataService.getLabelConfig(oldName);
    if (config) {
      this.dataService.deleteLabelConfig(oldName);
      const mergedConfig = this.dataService.getLabelConfig(newName);
      if (isMerge && mergedConfig) {
        // Fancy merge: Only overwrite present fields.
        mergedConfig.billing = isValidBilling(config.billing) ? config.billing : mergedConfig.billing;
        mergedConfig.description = config.description || mergedConfig.description;
        mergedConfig.displayColor = config.displayColor || mergedConfig.displayColor;
      }
      else {
        // Just copy the old config over.
        this.dataService.setLabelConfig(newName, config);
      }
    }

    // Migrate other occurences.
    this.ruleService.patchRulesForLabelRename(oldName, newName);
    const dominance = this.dataService.getUserSettings().labelDominanceOrder;
    if (dominance.hasOwnProperty(oldName)) {
      dominance[newName] = dominance[oldName];
      delete dominance[oldName];
    }

    return { success: true, didMerge: isMerge };
  }

  deleteLabel(label: string) {
    for (const tx of this.dataService.getCurrentTransactionList()) {
      removeLabelFromTransaction(tx, label);
    }
    this.dataService.deleteLabelConfig(label);
    const dominance = this.dataService.getUserSettings().labelDominanceOrder;
    if (dominance.hasOwnProperty(label)) {
      delete dominance[label];
    }

    // Note: Processing rules are intentionally left unaffected, as it isn't
    // clear what should happen to the referencing actions. If the user forgets
    // to delete the rule, they will simply notice the next time it is run.
  }

}
