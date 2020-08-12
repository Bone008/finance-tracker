import { AfterViewInit, Component, ElementRef, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import * as d3 from 'd3';
import { KeyedSetAggregate } from 'src/app/core/keyed-aggregate';
import { nested2ToSet } from 'src/app/core/util';
import { DataService } from '../../data.service';
import { AnalysisResult } from '../types';

interface LabelSimNode extends d3.SimulationNodeDatum {
  label: string;
  weight: number;
}
type LabelSimLink = d3.SimulationLinkDatum<LabelSimNode>;

@Component({
  selector: 'app-label-adjacency',
  templateUrl: './label-adjacency.component.html',
  styleUrls: ['./label-adjacency.component.css']
})
export class LabelAdjacencyComponent implements AfterViewInit, OnChanges {
  @Input()
  analysisResult: AnalysisResult;

  @ViewChild('graphContainer', { static: true })
  private graphContainer: ElementRef;

  private simulation: d3.Simulation<LabelSimNode, d3.SimulationLinkDatum<LabelSimNode>> | null = null;

  constructor(private readonly dataService: DataService) {
  }

  ngAfterViewInit() {
  }

  ngOnChanges(changes: SimpleChanges) {
    this.setupSimulation();
  }

  setupSimulation() {
    const container = d3.select<SVGSVGElement, LabelSimNode>(this.graphContainer.nativeElement);
    const { width, height } = (<SVGSVGElement>this.graphContainer.nativeElement).getBoundingClientRect();
    console.log(`SVG: ${width} x ${height}`);

    // Dummy marking center.
    container
      .append('circle')
      .attr('r', 2).attr('cx', width / 2).attr('cy', height / 2).attr('fill', 'red');

    // Transform data.
    const connections = this.buildLinks();
    const links: LabelSimLink[] =
      connections.map(([source, target]) => ({ source, target }));
    console.log("links:", links);

    //const labels = extractAllLabels(this.analysisResult.matchingTransactions);
    // Extract unique labels from edges. This implicitly filters out labels that
    // do not have any edges.
    const labels = Array.from(nested2ToSet(connections));
    const nodes: LabelSimNode[] = labels.map(label => ({
      label,
      weight: this.analysisResult.matchingTransactions.reduce((acc, t) => acc + +t.labels.includes(label), 0),
    }));
    const maxWeight = d3.max(nodes, d => d.weight)!;
    console.log(`nodes (maxWeight=${maxWeight}):`, nodes);

    // Set up or update force simulation.
    if (!this.simulation) {
      this.simulation = d3.forceSimulation<LabelSimNode>()
        .force("charge", d3.forceManyBody<LabelSimNode>()
          .distanceMax(200)
        )
        .force("link", d3.forceLink<LabelSimNode, LabelSimLink>()
          .id(d => d.label)
        )
        .force('centerX', d3.forceX(width / 2))
        .force('centerY', d3.forceY(height / 2))
        .force("center", d3.forceCenter(width / 2, height / 2));
    }
    this.retainSimulationData(nodes, this.simulation.nodes());
    const nodesWithoutPosition = nodes.filter(d => d.x === undefined || d.y === undefined);
    // Update the nodes in the simulation. This also sets their initial position,
    // but it is centered at the top left corner and not the middle.
    this.simulation.nodes(nodes);
    nodesWithoutPosition.forEach(d => { d.x! += width / 2; d.y! += height / 2; });

    // Update forces.
    // Callbacks have to be updated because the captured maxWeight param has changed.
    this.simulation.force<d3.ForceManyBody<LabelSimNode>>("charge")!
      .strength(d => -100 - 30 * d.weight / maxWeight);
    this.simulation.force<d3.ForceLink<LabelSimNode, LabelSimLink>>("link")!
      .distance(d => {
        const w1 = (d.source as LabelSimNode).weight;
        const w2 = (d.target as LabelSimNode).weight;
        // Large nodes have more distance.
        return 20 * (1 + 5 * Math.max(w1, w2) / maxWeight);
      })
      .links(links);
    this.simulation.alpha(0.5).restart();

    // Set up SVG elements.
    const d3Link = container.select('g.links')
      .selectAll("line")
      .data(links, (d: LabelSimLink) => d.source + "::XXXX::" + d.target)
      .join("line")
      .attr("stroke-width", d => 1); // TODO use tx count/pct as width

    console.log(this.analysisResult.collapsedLabelGroupNamesLookup);
    const d3Node = container.select("g.nodes")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .selectAll("circle")
      .data(nodes, (d: LabelSimNode) => d.label)
      .join("circle")
      .attr("r", d => 5 + Math.sqrt(100 * (d.weight / maxWeight)))
      .attr("fill", d => this.analysisResult.labelGroupColorsByName[this.analysisResult.collapsedLabelGroupNamesLookup[d.label] || d.label] || 'black')
      .call(this.createDragBehavior(this.simulation));

    d3Node.append("title").text(d => `${d.label} (${d.weight})`);

    this.simulation.on("tick", () => {
      d3Link
        .attr("x1", d => (d.source as LabelSimNode).x!)
        .attr("y1", d => (d.source as LabelSimNode).y!)
        .attr("x2", d => (d.target as LabelSimNode).x!)
        .attr("y2", d => (d.target as LabelSimNode).y!);

      d3Node
        .attr("cx", d => d.x!)
        .attr("cy", d => d.y!);
    });
    //.call(drag(simulation));

    this.simulation.on("end", () => {
      console.log('simulation ended');
    });
  }

  private retainSimulationData(newNodes: LabelSimNode[], oldNodes: LabelSimNode[]) {
    if (newNodes.length === 0) return; // fast path
    for (let i = 0; i < newNodes.length; i++) {
      const id = newNodes[i].label;
      const oldNode = oldNodes.find(node => node.label === id);
      if (oldNode) {
        // Keep old node to keep x/y/vx/vy/... from previous simulation.
        newNodes[i] = oldNode;
      }
    }
  }

  private createDragBehavior(simulation: d3.Simulation<any, any>) {
    return d3.drag<SVGElement, LabelSimNode>()
      .on("start", (d, i, d3Nodes) => {
        if (!d3.event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
        d3.select(d3Nodes[i]).attr("stroke", "gray").attr("stroke-width", 3);
      })
      .on("drag", d => {
        d.fx = d3.event.x;
        d.fy = d3.event.y;
      })
      .on("end", (d, i, d3Nodes) => {
        const event: d3.D3DragEvent<SVGElement, unknown, unknown> = d3.event;
        if (!event.active) simulation.alphaTarget(0);
        if ((event.sourceEvent as MouseEvent).shiftKey) {
          d3.select(d3Nodes[i]).attr("stroke", "green");
        } else {
          d.fx = null;
          d.fy = null;
          d3.select(d3Nodes[i]).attr("stroke", null).attr("stroke-width", null);
        }
      });
  }

  private buildLinks(): [string, string][] {
    // Copied from DialogLabelDominanceComponent.

    // Build matrix of labels that occur together within a single transaction.
    const labelCombinations = new KeyedSetAggregate<string>();
    for (const transaction of this.analysisResult.matchingTransactions) {
      for (let i = 0; i < transaction.labels.length; i++) {
        // Aggregate for each label all other labels. Note that even adding []
        // to the aggregate registers the key as an entry, so in the end we get
        // all labels.
        labelCombinations.addMany(transaction.labels[i], transaction.labels.slice(0, i));
        labelCombinations.addMany(transaction.labels[i], transaction.labels.slice(i + 1));
      }
    }

    const results: [string, string][] = [];
    for (const [label, neighbors] of labelCombinations.getEntries()) {
      for (const label2 of neighbors) {
        if (label < label2) {
          results.push([label, label2]);
        }
      }
    }
    return results;
  }
}
