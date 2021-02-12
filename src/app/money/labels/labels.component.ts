import { NestedTreeControl } from '@angular/cdk/tree';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatTreeNestedDataSource } from '@angular/material/tree';
import * as moment from 'moment';
import { Subscription } from 'rxjs';
import { LoggerService } from 'src/app/core/logger.service';
import { timestampToMilliseconds } from 'src/app/core/proto-util';
import { escapeQuotedString, escapeRegex, maxByComparator, pluralize } from 'src/app/core/util';
import { BillingInfo, LabelConfig } from '../../../proto/model';
import { DataService } from '../data.service';
import { LabelHierarchyNode, LabelService, LABEL_HIERARCHY_SEPARATOR } from '../label.service';
import { mapTransactionData, sanitizeLabelName } from '../model-util';

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
  // Note: There is also flat tree control, which might be nicer to use.
  // See: https://material.angular.io/components/tree/overview
  treeControl = new NestedTreeControl<LabelInfoNode, string>(node => node.children, {
    trackBy: node => node.name,
  });
  treeDataSource = new MatTreeNestedDataSource<LabelInfoNode>();

  hasAnyExpandableNodes = false;
  currentEditLabel: string | null = null;

  /** Stores LabelConfig instances for the UI of labels that have no associated instance yet. */
  private configInstancesCache: { [label: string]: LabelConfig } = {};
  private txSubscription: Subscription;

  constructor(
    private readonly labelService: LabelService,
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

    const { success, didMerge } = this.labelService.renameLabel(oldName, newName);
    if (!success) { return; }

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

    // Check if hierarchy changed.
    const oldPrefix = oldName.substr(0, oldName.lastIndexOf(LABEL_HIERARCHY_SEPARATOR));
    const newPrefix = newName.substr(0, newName.lastIndexOf(LABEL_HIERARCHY_SEPARATOR));

    if (!isRecursing && (didMerge || oldPrefix !== newPrefix)) {
      this.refreshLabelTree();
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
    this.labelService.deleteLabel(label);

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

    const data = this.labelService.buildHierarchyFromAll()
      .map(node => this._convertLabelNode(node));

    this.treeDataSource.data = data;
    this.treeControl.dataNodes = data;
    this.hasAnyExpandableNodes = data.some(node => node.children.length > 0);

    if (this.currentEditLabel) {
      this.expandAncestors(this.currentEditLabel);
    }
  }

  private _convertLabelNode({ fullName, children }: LabelHierarchyNode): LabelInfoNode {
    // Recurse.
    const convertedChildren = children.map(child => this._convertLabelNode(child));

    // Count associated transactions.
    const matchingTransactions = this.dataService.getCurrentTransactionList()
      .filter(t => t.labels.includes(fullName));
    const numDescendentTransactions = convertedChildren
      .map(child => child.numTransactionsTransitive)
      .reduce((a, b) => a + b, 0);

    // Find maximum date.
    const lastUsedSelf = matchingTransactions.length > 0
      ? moment(Math.max(
        ...matchingTransactions.map(t => Math.max(
          ...mapTransactionData(t, data => timestampToMilliseconds(data.date))))))
      : null;
    const lastUsedDescendents = maxByComparator(
      convertedChildren.map(child => child.lastUsedMomentTransitive).filter(value => value !== null),
      (a, b) => a!.valueOf() - b!.valueOf());

    return {
      name: fullName,
      numTransactions: matchingTransactions.length,
      numTransactionsTransitive: matchingTransactions.length + numDescendentTransactions,
      lastUsedMoment: lastUsedSelf,
      lastUsedMomentTransitive: (lastUsedSelf && lastUsedDescendents)
        ? moment.max(lastUsedSelf, lastUsedDescendents)
        : (lastUsedSelf || lastUsedDescendents),
      children: convertedChildren,
    };
  }

  /** Ensures that a given label is visible by expanding all of its ancestors. */
  private expandAncestors(label: string) {
    for (const node of this.treeControl.dataNodes) {
      this._expandIfDescendantsMatch(node, label);
    }
  }

  private _expandIfDescendantsMatch(node: LabelInfoNode, label: string): boolean {
    if (node.name === label) {
      return true;
    }
    const match = node.children.some(child => this._expandIfDescendantsMatch(child, label));
    if (match) {
      this.treeControl.expand(node);
    }
    return match;
  }
}
