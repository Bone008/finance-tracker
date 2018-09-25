import { DecimalPipe } from '@angular/common';
import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, ViewChild } from '@angular/core';
import { Chart, ChartData, ChartType } from 'chart.js';

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

  @ViewChild('chartCanvas')
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
    const canvas = this.chartCanvas.nativeElement as HTMLCanvasElement;
    this.chart = new Chart(canvas, {
      type: this.type,
      data: this.internalChartData,
      options: {
        maintainAspectRatio: false,
        legend: { position: 'top' },
        tooltips: {
          mode: 'index',
          callbacks: {
            label: (item, data) => {
              let label = this.decimalPipe.transform(item.yLabel, '1.2-2') + ' €';
              let datasetName = data.datasets && data.datasets[item.datasetIndex!].label;
              if (datasetName) {
                label += ` (${datasetName})`;
              }
              return label;
            },
          },
        },
      },
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    this.patchObject(this.internalChartData, this.data);
    if (this.chart) {
      this.chart.update();
    }
  }

  /** Makes sure obj contains the same values as newData without changing its identity. */
  private patchObject(obj: any, newObj: any) {
    // Special case for arrays: also patch length
    if (Array.isArray(obj) && Array.isArray(newObj)) {
      obj.length = newObj.length;
    }

    for (const key in newObj) {
      // Deep copy objects.
      if (typeof obj[key] === 'object' && typeof newObj[key] === 'object') {
        this.patchObject(obj[key], newObj[key]);
      } else {
        obj[key] = newObj[key];
      }
    }
    // Remove properties no longer present in newData.
    for (const key in obj) {
      // Keep chart.js metadata (_meta) untouched.
      if (!(key in newObj) && key.indexOf('_') !== 0) {
        delete obj[key];
      }
    }
  }
}
