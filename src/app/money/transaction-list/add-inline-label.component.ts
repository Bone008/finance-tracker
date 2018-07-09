import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

@Component({
  selector: 'app-add-inline-label',
  templateUrl: './add-inline-label.component.html',
  styleUrls: ['./add-inline-label.component.css']
})
export class AddInlineLabelComponent implements OnInit {
  newLabel = "";

  /**
   * This property is debounced to prevent it from jumping around
   * when switching focus from the input element to the confirm button.
   */
  @Output() isOpen = false;
  @Output() addRequested = new EventEmitter<string>();
  @Output() deleteLastRequested = new EventEmitter<void>();

  private isOpenSubject = new Subject<boolean>();

  constructor() {
    this.isOpenSubject
      .pipe(debounceTime(50))
      .subscribe(value => this.isOpen = value);
  }

  ngOnInit() {
  }

  setIsOpen(value: boolean) {
    this.isOpenSubject.next(value);
  }

  confirmAdd() {
    const cleanLabel = this.newLabel.trim().toLowerCase();
    if (cleanLabel.length > 0) {
      this.addRequested.emit(cleanLabel);
    }
    this.newLabel = "";
  }

  requestDelete() {
    this.deleteLastRequested.next();
  }

}
