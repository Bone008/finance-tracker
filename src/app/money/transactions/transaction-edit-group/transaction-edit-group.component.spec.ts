import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TransactionEditGroupComponent } from './transaction-edit-group.component';

describe('TransactionEditGroupComponent', () => {
  let component: TransactionEditGroupComponent;
  let fixture: ComponentFixture<TransactionEditGroupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TransactionEditGroupComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TransactionEditGroupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
