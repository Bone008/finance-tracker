import { Component, OnInit, Output } from '@angular/core';
import { DataContainer } from './data-container.model';
import { StorageService } from './storage.service';

@Component({
  selector: 'app-money',
  templateUrl: './money.component.html',
  styleUrls: ['./money.component.css']
})
export class MoneyComponent implements OnInit {
  data: DataContainer | null = null;

  @Output() status: string = null;

  constructor(private readonly storageService: StorageService) { }

  async ngOnInit() {
    this.status = "Loading ...";
    this.data = await this.storageService.loadData();
    this.status = "Last modified " + this.formatDate(this.data.lastModified);
  }

  async syncData() {
    this.status = "Saving ...";
    await this.storageService.saveData(this.data);
    this.status = "Last modified " + this.formatDate(this.data.lastModified);
  }

  private formatDate(date: Date) {
    if (date.toDateString() === (new Date()).toDateString()) {
      return date.toLocaleTimeString();
    } else {
      return date.toLocaleString();
    }
  }

}
