import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { BalancesComponent } from './balances.component';

describe('BalancesComponent', () => {
  let component: BalancesComponent;
  let fixture: ComponentFixture<BalancesComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ BalancesComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(BalancesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
