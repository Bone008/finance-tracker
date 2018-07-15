import { Component, OnInit, Output } from '@angular/core';
import { DataContainer } from '../../proto/model';
import { LoggerService } from '../core/logger.service';
import { timestampToDate } from '../core/proto-util';
import { DataService } from './data.service';
import { createDummyTransactions, StorageService } from './storage.service';

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
          this.dataService.setDataContainer(new DataContainer());
          this.status = error;
        })
      .then(() => this.hasData = true);
  }

  async syncData() {
    if (!this.hasData) return;

    this.status = "Saving ...";

    const data = this.dataService.getDataContainer();

    try {
      await this.storageService.saveData(data);
      this.status = "Last saved " + this.formatDate(timestampToDate(data.lastModified));
    } catch (e) {
      this.status = e;
    }
  }

  private formatDate(date: Date) {
    if (date.toDateString() === (new Date()).toDateString()) {
      return date.toLocaleTimeString();
    } else {
      return date.toLocaleString();
    }
  }

}
