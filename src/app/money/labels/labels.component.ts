import { NestedTreeControl } from '@angular/cdk/tree';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatTreeNestedDataSource } from '@angular/material/tree';
import * as moment from 'moment';
import { Observable, Subscription } from 'rxjs';
import { KeyedArrayAggregate } from 'src/app/core/keyed-aggregate';
import { LoggerService } from 'src/app/core/logger.service';
import { timestampToMilliseconds } from 'src/app/core/proto-util';
import { escapeQuotedString, escapeRegex, maxByComparator, pluralize } from 'src/app/core/util';
import { BillingInfo, LabelConfig } from '../../../proto/model';
import { LABEL_HIERARCHY_SEPARATOR } from '../analytics/types';
import { DataService } from '../data.service';
import { isValidBilling, mapTransactionData, removeLabelFromTransaction, sanitizeLabelName } from '../model-util';
import { RuleService } from '../rule.service';

interface LabelInfoNode {
  name: string;
  /** Associated transactions on this node. */
  numTransactions: number;
  /** Associated transactions on this node and all descendent nodes. */
  numTransactionsTransitive: number;
  lastUsedMoment: moment.Moment | null;
  lastUsedMomentTransitive: moment.Moment | null;
  children: LabelInfoNode[];
}

@Component({
  selector: 'app-labels',
  templateUrl: './labels.component.html',
  styleUrls: ['./labels.component.scss']
})
export class LabelsComponent implements OnInit, OnDestroy {
  allLabels$: Observable<LabelInfoNode[]>;

  // TODO: There is also flat tree control, which I probably want to use instead.
  // That simplifies showing multiple columns.
  // See: https://material.angular.io/components/tree/overview
  treeControl = new NestedTreeControl<LabelInfoNode>(node => node.children);
  treeDataSource = new MatTreeNestedDataSource<LabelInfoNode>();

  currentEditLabel: string | null = null;

  /** Stores LabelConfig instances for the UI of labels that have no associated instance yet. */
  private configInstancesCache: { [label: string]: LabelConfig } = {};
  private txSubscription: Subscription;

  constructor(
    private readonly ruleService: RuleService,
    private readonly dataService: DataService,
    private readonly logger: LoggerService) { }

  ngOnInit() {
    this.txSubscription = this.dataService.transactions$
      .subscribe(() => { this.refreshLabelTree(); });
  }

  ngOnDestroy() {
    this.txSubscription.unsubscribe();
  }

  expandAll() {
    this.treeControl.expandAll();
  }

  collapseAll() {
    this.treeControl.collapseAll();
  }

  // View helpers
  isExpanded(node: LabelInfoNode): boolean {
    return this.treeControl.isExpanded(node);
  }
  hasChildren(node: LabelInfoNode): boolean {
    return node.children.length > 0;
  }
  hasHiddenChildren(node: LabelInfoNode): boolean {
    return node.children.length > 0 && !this.treeControl.isExpanded(node);
  }

  getLabelFilterString(label: string, includeChildren: boolean): string {
    if (includeChildren) {
      return 'label:^' + escapeQuotedString(escapeRegex(label));
    }
    return 'label=' + escapeQuotedString(label);
  }

  toggleEditLabel(label: string) {
    if (this.currentEditLabel === label) {
      this.currentEditLabel = null;
    } else {
      this.currentEditLabel = label;
    }
  }

  // ### for editing START ###

  renameLabelNode(labelNode: LabelInfoNode, rawNewName: string, isRecursing = false) {
    const oldName = labelNode.name;
    const newName = sanitizeLabelName(rawNewName);
    if (newName === oldName) {
      return;
    }
    this.logger.debug('renaming:', oldName, '->', newName);

    const isMerge = this.dataService.getAllLabelsSet().has(newName);
    if (isMerge && !confirm(`The label "${newName}" already exists. If you continue, it will be merged with "${oldName}". `
      + `Transactions will no longer be distinguishable.\n\n`
      + `This cannot be undone! Do you want to continue?`)) {
      return;
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

    // Adjust node.
    labelNode.name = newName;
    if (this.currentEditLabel === oldName) {
      this.currentEditLabel = newName;
      // Note: needs to be done differently when merging nodes to fix tree.
    }

    // Recurse (after asking for confimration).
    if (labelNode.children.length > 0 &&
      confirm(`Do you also want to rename child labels of "${oldName}"?\n\n`
        + `Affected labels: ${labelNode.children.map(child => child.name).join(', ')}`)) {
      for (const child of labelNode.children) {
        const newChildName = newName + child.name.substr(oldName.length);
        this.renameLabelNode(child, newChildName, true);
      }
    }

    if (!isRecursing && isMerge) {
      this.refreshLabelTree();
      this.treeControl.expansionModel
    }
  }

  deleteLabelNode(labelNode: LabelInfoNode) {
    if (labelNode.children.length > 0) {
      alert('The label cannot be deleted because it has child labels! Please delete them first.');
      return;
    }
    const label = labelNode.name;
    const msg = `Do you really want to delete the label "${label}"?\n\n`
      + `The label will be removed from ${pluralize(labelNode.numTransactions, 'transaction')}. This cannot be undone.`;
    if (!confirm(msg)) {
      return;
    }

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


    if (this.currentEditLabel === label) {
      this.currentEditLabel = null;
    }
    this.refreshLabelTree();
  }

  setDisplayColorEnabled(label: string, enabled: boolean) {
    const config = this.getConfigForLabel(label);
    config.displayColor = enabled ? (config.displayColor || '#ffffff') : '';
  }

  isDisplayColorEnabled(label: string): boolean {
    return this.getConfigForLabel(label).displayColor !== '';
  }

  getConfigForLabel(label: string): LabelConfig {
    if (this.configInstancesCache.hasOwnProperty(label)) {
      return this.configInstancesCache[label];
    }

    // If already persisted --> cache and return.
    const config = this.dataService.getLabelConfig(label);
    if (config) {
      this.configInstancesCache[label] = config;
      return config;
    }

    this.logger.debug(`[LABELS] creating proxy for ${label}.`);
    // Otherwise create a transient config, and proxy setters to start
    // persisting the config as soon as the user changes any property.
    const transientObj = new LabelConfig({
      billing: new BillingInfo({ isRelative: true }),
    });
    const proxy = new Proxy(transientObj, {
      set: (obj, prop, value) => {
        obj[prop] = value;
        this.persistTransientConfig(label, obj);
        return true;
      },
    });
    this.configInstancesCache[label] = proxy;
    return proxy;
  }

  private persistTransientConfig(label: string, config: LabelConfig) {
    this.dataService.setLabelConfig(label, config);
    // Remove proxy.
    this.configInstancesCache[label] = config;

    this.logger.debug(`[LABELS] persisting ${label} because of value change.`);
  }
  // ### for editing END ###

  private refreshLabelTree() {
    this.configInstancesCache = {};
    const treeState = this.rememberTreeState();

    // TODO: Migrate to utility function to merge with analytics version.
    // TODO: Support more than 1 nesting level.
    const labels = this.dataService.getAllLabels();
    const parentLabels = new KeyedArrayAggregate<string>();
    for (const label of labels) {
      const sepIndex = label.indexOf(LABEL_HIERARCHY_SEPARATOR);
      if (sepIndex > 0) {
        //parentLabels.add(label.substr(0, sepIndex), label.substr(sepIndex + 1));
        parentLabels.add(label.substr(0, sepIndex), label);
      } else {
        // Just a regular label, but it may be a parent to some other children.
        parentLabels.add(label, label);
      }
    }

    const data = parentLabels.getEntriesSorted()
      .map(([parentName, children]) => this.makeLabelNode(parentName, children));

    // const data = this.dataService.getAllLabels()
    //   .sort()
    //   .map(labelName => <LabelInfoNode>{
    //     name: labelName,
    //     numTransactions: this.dataService.getCurrentTransactionList().filter(t => t.labels.includes(labelName)).length,
    //   });

    this.treeDataSource.data = data;
    this.treeControl.dataNodes = data;
    this.restoreTreeState(treeState);
  }

  private makeLabelNode(name: string, children?: string[]): LabelInfoNode {
    if (!children) { children = []; }
    // Recurse.
    const childNodes = children
      .filter(childName => childName !== name)
      .map(childName => this.makeLabelNode(childName));

    // Count associated transactions.
    const matchingTransactions = this.dataService.getCurrentTransactionList()
      .filter(t => t.labels.includes(name));
    const numDescendentTransactions = childNodes
      .map(child => child.numTransactionsTransitive)
      .reduce((a, b) => a + b, 0);

    // Find maximum date.
    const lastUsedSelf = matchingTransactions.length > 0
      ? moment(Math.max(
        ...matchingTransactions.map(t => Math.max(
          ...mapTransactionData(t, data => timestampToMilliseconds(data.date))))))
      : null;
    const lastUsedDescendents = maxByComparator(
      childNodes.map(child => child.lastUsedMomentTransitive).filter(value => value !== null),
      (a, b) => a!.valueOf() - b!.valueOf());

    return {
      name,
      numTransactions: matchingTransactions.length,
      numTransactionsTransitive: matchingTransactions.length + numDescendentTransactions,
      lastUsedMoment: lastUsedSelf,
      lastUsedMomentTransitive: (lastUsedSelf && lastUsedDescendents)
        ? moment.max(lastUsedSelf, lastUsedDescendents)
        : (lastUsedSelf || lastUsedDescendents),
      children: childNodes,
    };
  }

  private rememberTreeState(): string[] {
    return this.treeControl.expansionModel.selected.map(n => n.name);
  }

  private restoreTreeState(expandedNodes: string[]) {
    const expandedSet = new Set(expandedNodes);
    for (const root of this.treeControl.dataNodes) {
      for (const node of [root, ...this.treeControl.getDescendants(root)]) {
        if (expandedSet.has(node.name)) {
          this.treeControl.expand(node);
        }
      }
    }
  }
}
