import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TransactionNotesComponent } from './transaction-notes.component';

describe('TransactionNotesComponent', () => {
  let component: TransactionNotesComponent;
  let fixture: ComponentFixture<TransactionNotesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TransactionNotesComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TransactionNotesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
