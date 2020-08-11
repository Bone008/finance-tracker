import { AfterViewInit, Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import * as d3 from 'd3';
import { KeyedSetAggregate } from 'src/app/core/keyed-aggregate';
import { DataService } from '../../data.service';

interface LabelSimNode extends d3.SimulationNodeDatum {
  label: string;
  weight: number;
}

@Component({
  selector: 'app-label-adjacency',
  templateUrl: './label-adjacency.component.html',
  styleUrls: ['./label-adjacency.component.css']
})
export class LabelAdjacencyComponent implements OnInit, AfterViewInit {
  @ViewChild('graphContainer', { static: true })
  private graphContainer: ElementRef;

  constructor(private readonly dataService: DataService) {
  }


  ngOnInit() {
  }

  ngAfterViewInit() {
    setTimeout(() => this.setupSimulation(), 1000);
  }

  setupSimulation() {
    const container = d3.select(this.graphContainer.nativeElement);
    const { width, height } = (<SVGSVGElement>this.graphContainer.nativeElement).getBoundingClientRect();
    console.log(`SVG: ${width} x ${height}`);

    // Dummy marking center.
    container
      .append('circle')
      .attr('r', 5).attr('cx', width / 2).attr('cy', height / 2).attr('fill', 'red');

    // Transform data.
    const labels = this.dataService.getAllLabels();
    const nodes: LabelSimNode[] = labels.map(label => ({
      label,
      weight: this.dataService.getCurrentTransactionList().reduce((acc, t) => acc + +t.labels.includes(label), 0),
    }));
    const maxWeight = d3.max(nodes, d => d.weight)!;
    console.log(`nodes (maxWeight=${maxWeight}):`, nodes);

    const connections = this.buildLinks();
    const links: d3.SimulationLinkDatum<LabelSimNode>[] =
      connections.map(([source, target]) => ({ source, target }));
    console.log("links:", links);

    // Set up force simulation.
    const simulation = d3.forceSimulation(nodes)
      .force("charge", d3.forceManyBody<LabelSimNode>()
        .distanceMax(200)
        .strength(d => -30 - 30 * d.weight / maxWeight))
      .force("link", d3.forceLink<LabelSimNode, typeof links[0]>(links)
        .id(d => d.label))
      .force("center", d3.forceCenter(width / 2, height / 2));

    // Set up SVG elements.
    const d3Link = container.append("g")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", d => 1); // TODO use tx count/pct as width

    const d3Node = container.append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", d => 5 + Math.sqrt(60 * (d.weight / maxWeight)))
      .attr("fill", 'green');

    d3Node.append("title").text(d => d.label);

    simulation.on("tick", () => {
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
  }

  private buildLinks(): [string, string][] {
    // Copied from DialogLabelDominanceComponent.

    // Build matrix of labels that occur together within a single transaction.
    const labelCombinations = new KeyedSetAggregate<string>();
    for (const transaction of this.dataService.getCurrentTransactionList()) {
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
