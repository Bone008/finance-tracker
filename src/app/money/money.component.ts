import { Component, OnInit, Output } from '@angular/core';
import { StorageService } from './storage.service';
import { DataService } from './data.service';
import { DataContainer } from '../../proto/model';
import { timestampToDate } from '../core/proto-util';

@Component({
  selector: 'app-money',
  templateUrl: './money.component.html',
  styleUrls: ['./money.component.css']
})
export class MoneyComponent implements OnInit {
  data: DataContainer | null = null;

  @Output() status: string|null = null;

  constructor(
    private readonly dataService: DataService,
    private readonly storageService: StorageService) { }

  async ngOnInit() {
    this.status = "Loading ...";
    this.data = await this.storageService.loadData();
    this.dataService.setDataContainer(this.data);
    this.status = "Last modified " + this.formatDate(timestampToDate(this.data.lastModified));
  }

  async syncData() {
    if(!this.data) return;
    
    this.status = "Saving ...";
    await this.storageService.saveData(this.data);
    this.status = "Last modified " + this.formatDate(timestampToDate(this.data.lastModified));
  }

  private formatDate(date: Date) {
    if (date.toDateString() === (new Date()).toDateString()) {
      return date.toLocaleTimeString();
    } else {
      return date.toLocaleString();
    }
  }

}
