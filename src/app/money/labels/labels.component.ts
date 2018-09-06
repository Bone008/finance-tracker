import { Component, OnInit } from '@angular/core';
import { DataService } from '../data.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

interface LabelInfo {
  name: string;
  numTransactions: number;
  firstTransactionTime?: Date;
  lastTransactionTime?: Date;
}

@Component({
  selector: 'app-labels',
  templateUrl: './labels.component.html',
  styleUrls: ['./labels.component.css']
})
export class LabelsComponent implements OnInit {
  allLabels$: Observable<LabelInfo[]>;

  constructor(private readonly dataService: DataService) { }

  ngOnInit() {
    this.allLabels$ = this.dataService.transactions$
      .pipe(map(() => this.dataService.getAllLabels()
        .sort()
        .map(labelName => <LabelInfo>{
          name: labelName,
          numTransactions: this.dataService.getCurrentTransactionList().filter(t => t.labels.includes(labelName)).length,
        })));
  }

}
