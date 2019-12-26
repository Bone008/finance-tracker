import { DecimalPipe } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { Chart, ChartData, ChartTooltipCallback, ChartType } from 'chart.js';
import { patchObject } from 'src/app/core/util';

export interface ChartElementClickEvent {
  datasetIndex: number;
  index: number;
  mouseEvent: MouseEvent;
}

// Set global defaults for chart.js.
// See https://www.chartjs.org/docs/latest/axes/.
(<any>Chart).scaleService.updateScaleDefaults('linear', {
  ticks: {
    suggestedMin: 0,
  }
});

/**
 * More or less generic wrapper around chart.js based on data-bound input.
 */
@Component({
  selector: 'app-chart',
  templateUrl: './chart.component.html',
  styleUrls: ['./chart.component.css']
})
export class ChartComponent implements OnInit, OnDestroy, AfterViewInit, OnChanges {
  @Input()
  type: ChartType;
  @Input()
  data: ChartData;
  @Input()
  tooltipCallbacks?: ChartTooltipCallback;
  @Output()
  readonly elementClick = new EventEmitter<ChartElementClickEvent>();

  @ViewChild('chartCanvas', { static: true })
  private chartCanvas: ElementRef;

  private chart: Chart;
  private internalChartData: ChartData = {};

  private readonly decimalPipe = new DecimalPipe('en-US');

  constructor() {

  }

  ngOnInit() { }

  ngOnDestroy() {
    if (this.chart) {
      this.chart.destroy();
    }
  }

  ngAfterViewInit() {
    const defaultTooltipCallbacks: ChartTooltipCallback = {
      label: (item, data) => {
        // Some tailored default callback otherwise.
        const rawValue = item.yLabel || (data.datasets && data.datasets[item.datasetIndex!].data![item.index!]);
        let label = this.decimalPipe.transform(rawValue, '1.2-2') + ' €';
        const datasetName = data.datasets && data.datasets[item.datasetIndex!].label;
        if (datasetName) {
          label += ` (${datasetName})`;
        }
        // Prepend name of data point for pie charts.
        if (this.type === 'pie' && data.labels) {
          label = data.labels[item.index!] + ': ' + label;
        }
        return label;
      },
    };

    const canvas = this.chartCanvas.nativeElement as HTMLCanvasElement;
    this.chart = new Chart(canvas, {
      type: this.type,
      data: this.internalChartData,
      options: {
        maintainAspectRatio: false,
        legend: { position: 'top' },
        tooltips: {
          mode: 'index',
          callbacks: Object.assign({}, defaultTooltipCallbacks, this.tooltipCallbacks),
        },
        onClick: (event: MouseEvent, elements: any[]) => {
          if (elements.length > 0) {
            const datasetIndex: any = elements[0]._datasetIndex;
            const index: any = elements[0]._index;
            if (typeof datasetIndex === 'number' && typeof index === 'number') {
              this.elementClick.emit({ datasetIndex, index, mouseEvent: event });
            } else {
              console.warn('Could not locate datasetIndex and index on clicked chart element!', elements[0]);
            }
          }
        },
      },
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.hasOwnProperty('data')) {
      patchObject(this.internalChartData, this.data);
      if (this.chart) {
        this.chart.update();
      }
    }
  }
}
