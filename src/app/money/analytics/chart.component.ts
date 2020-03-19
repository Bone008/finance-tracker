import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { Chart, ChartData, ChartTooltipCallback, ChartType } from 'chart.js';
import { patchObject } from 'src/app/core/util';
import { CurrencyService } from '../currency.service';
import { DataService } from '../data.service';

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
  @Input()
  showLegend = true;
  @Output()
  readonly elementClick = new EventEmitter<ChartElementClickEvent>();

  @ViewChild('chartCanvas', { static: true })
  private chartCanvas: ElementRef;

  private chart: Chart | null = null;
  private internalChartData: ChartData = {};

  constructor(
    private readonly currencySerivce: CurrencyService,
    private readonly dataService: DataService) { }

  ngOnInit() { }

  ngOnDestroy() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }

  ngAfterViewInit() {
    this.initChart();
  }

  private initChart() {
    if (this.chart) {
      this.chart.destroy();
    }

    const defaultTooltipCallbacks: ChartTooltipCallback = {
      label: (item, data) => {
        // Some tailored default callback otherwise.
        const rawValue = item.yLabel || (data.datasets && data.datasets[item.datasetIndex!].data![item.index!]);
        let label = this.currencySerivce.format(Number(rawValue), this.dataService.getMainCurrency());
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
        legend: { position: 'top', display: this.showLegend },
        tooltips: {
          mode: this.type === 'bar' ? 'x' : 'index',
          callbacks: Object.assign({}, defaultTooltipCallbacks, this.tooltipCallbacks),
          filter: (item, data) => {
            // Hide rows with values of 0.
            const n = Number(data.datasets && data.datasets[item.datasetIndex!].data![item.index!]);
            return isNaN(n) || n !== 0;
          },
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
        scales: this.type === 'bar' || this.type === 'horizontalBar' ? {
          xAxes: [{ stacked: true }],
          yAxes: [{ stacked: true /*, ticks: { suggestedMax: 20000 } */ }],
        } : {},
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
    if (changes.hasOwnProperty('showLegend') || changes.hasOwnProperty('type')) {
      this.initChart();
    }
  }
}
