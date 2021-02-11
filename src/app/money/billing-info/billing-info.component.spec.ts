import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { BillingInfoComponent } from './billing-info.component';

describe('BillingInfoComponent', () => {
  let component: BillingInfoComponent;
  let fixture: ComponentFixture<BillingInfoComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ BillingInfoComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(BillingInfoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
