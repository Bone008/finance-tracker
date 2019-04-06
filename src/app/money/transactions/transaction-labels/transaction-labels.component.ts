import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

export type LabelMouseEvent = MouseEvent & { label: string };

@Component({
  selector: 'app-transaction-labels',
  templateUrl: './transaction-labels.component.html',
  styleUrls: ['./transaction-labels.component.css']
})
export class TransactionLabelsComponent implements OnInit {
  @Input() labels: string[] = [];
  @Input() labelTitle: string = '';
  @Input() alwaysOpen = false;

  @Output() readonly labelClick = new EventEmitter<LabelMouseEvent>();
  @Output() readonly labelAdd = new EventEmitter<string>();
  @Output() readonly labelDelete = new EventEmitter<string>();
  @Output() readonly labelDeleteLast = new EventEmitter<void>();

  constructor() { }

  ngOnInit() {
  }

  emitLabelClick(label: string, event: MouseEvent) {
    const event2 = event as LabelMouseEvent;
    event2.label = label;
    this.labelClick.emit(event2);
  }

}
