import { Component, OnInit } from '@angular/core';
import { readFileAsTextAsync } from '../../core/util';
import { LoggerService } from '../../core/logger.service';

@Component({
  selector: 'app-form-import',
  templateUrl: './form-import.component.html',
  styleUrls: ['./form-import.component.css']
})
export class FormImportComponent implements OnInit {

  constructor(private readonly loggerService: LoggerService) { }

  ngOnInit() {
  }

  setFile(file: File) {
    console.log(file);
    readFileAsTextAsync(file).then(
      this.processFileContents.bind(this),
      err => this.loggerService.error(err)
    );
  }

  private processFileContents(fileContents: string) {
    console.log(fileContents);
  }

}
