import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { DialogSplitTransactionComponent } from './dialog-split-transaction.component';

describe('DialogSplitTransactionComponent', () => {
  let component: DialogSplitTransactionComponent;
  let fixture: ComponentFixture<DialogSplitTransactionComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ DialogSplitTransactionComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(DialogSplitTransactionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
