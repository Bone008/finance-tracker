import { Component, OnInit, Output } from '@angular/core';
import { StorageService, createDummyTransactions } from './storage.service';
import { DataService } from './data.service';
import { DataContainer } from '../../proto/model';
import { timestampToDate } from '../core/proto-util';
import { LoggerService } from '../core/logger.service';

@Component({
  selector: 'app-money',
  templateUrl: './money.component.html',
  styleUrls: ['./money.component.css']
})
export class MoneyComponent implements OnInit {
  hasData = false;

  @Output() status: string | null = null;

  constructor(
    private readonly dataService: DataService,
    private readonly storageService: StorageService,
    private readonly loggerService: LoggerService, ) { }

  ngOnInit() {
    this.status = "Loading ...";
    this.storageService.loadData()
      .then(
        data => {
          if (data) {
            this.dataService.setDataContainer(data);
            this.status = "Last saved " + this.formatDate(timestampToDate(data.lastModified));
          } else {
            this.dataService.setDataContainer(new DataContainer({
              transactions: createDummyTransactions(50),
            }));
            this.status = "Using dummy data";
          }
        },
        error => {
          this.loggerService.error("Failed to load data: ", error);
          this.dataService.setDataContainer(new DataContainer());
          this.status = "Error loading data";
        })
      .then(() => this.hasData = true);
  }

  async syncData() {
    if (!this.hasData) return;

    this.status = "Saving ...";

    const data = this.dataService.getDataContainer();
    await this.storageService.saveData(data)
      .catch(e => this.loggerService.error("failed to sync data", e));
    this.status = "Last saved " + this.formatDate(timestampToDate(data.lastModified));
  }

  private formatDate(date: Date) {
    if (date.toDateString() === (new Date()).toDateString()) {
      return date.toLocaleTimeString();
    } else {
      return date.toLocaleString();
    }
  }

}
