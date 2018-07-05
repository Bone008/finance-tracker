import { Component, OnInit } from '@angular/core';
import { LoggerService } from '../../core/logger.service';
import { PapaParseService, PapaParseResult } from 'ngx-papaparse';

@Component({
  selector: 'app-form-import',
  templateUrl: './form-import.component.html',
  styleUrls: ['./form-import.component.css']
})
export class FormImportComponent implements OnInit {
  fileFormat: 'ksk_camt' = 'ksk_camt';

  constructor(
    private readonly loggerService: LoggerService,
    private readonly papaService: PapaParseService) { }

  ngOnInit() {
  }

  setFile(file: File) {
    console.log(file);
    this.papaService.parse(file, {
      header: true,
      complete: result => this.processFileContents(result),
    });
  }

  private processFileContents(csvData: PapaParseResult) {
    console.log(csvData);
  }

}
