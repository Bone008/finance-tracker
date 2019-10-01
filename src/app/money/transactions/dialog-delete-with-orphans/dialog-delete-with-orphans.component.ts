import { Component, OnInit, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  selector: 'app-dialog-delete-with-orphans',
  templateUrl: './dialog-delete-with-orphans.component.html',
  styleUrls: ['./dialog-delete-with-orphans.component.css']
})
export class DialogDeleteWithOrphansComponent implements OnInit {
  readonly numTransactions: number;
  readonly numOrphans: number;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: { numTransactions: number, numOrphans: number }
  ) {
    this.numTransactions = data.numTransactions;
    this.numOrphans = data.numOrphans;
  }

  ngOnInit() {
  }
}
