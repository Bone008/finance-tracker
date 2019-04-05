import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { ProcessingRule } from '../../../proto/model';
import { DataService } from '../data.service';

@Component({
  selector: 'app-rules',
  templateUrl: './rules.component.html',
  styleUrls: ['./rules.component.css']
})
export class RulesComponent implements OnInit {
  rules$: Observable<ProcessingRule[]>;

  constructor(private readonly dataService: DataService) { }

  ngOnInit() {
    this.rules$ = this.dataService.processingRules$;
  }

}
