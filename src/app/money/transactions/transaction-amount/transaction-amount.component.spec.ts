import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TransactionAmountComponent } from './transaction-amount.component';

describe('TransactionAmountComponent', () => {
  let component: TransactionAmountComponent;
  let fixture: ComponentFixture<TransactionAmountComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TransactionAmountComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TransactionAmountComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
