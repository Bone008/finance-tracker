import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { TransactionLabelsComponent } from './transaction-labels.component';

describe('TransactionLabelsComponent', () => {
  let component: TransactionLabelsComponent;
  let fixture: ComponentFixture<TransactionLabelsComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ TransactionLabelsComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(TransactionLabelsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
