import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ImportedRow } from 'src/proto/model';

@Component({
  selector: 'app-dialog-view-imported-row',
  templateUrl: './dialog-view-imported-row.component.html',
  styleUrls: ['./dialog-view-imported-row.component.css']
})
export class DialogViewImportedRowComponent implements OnInit {
  readonly row: ImportedRow;
  readonly columns: string[];

  constructor(
    @Inject(MAT_DIALOG_DATA) data: { importedRow: ImportedRow }
  ) {
    this.row = data.importedRow;
    this.columns = Object.keys(this.row.values);
  }

  ngOnInit() {
  }
}
