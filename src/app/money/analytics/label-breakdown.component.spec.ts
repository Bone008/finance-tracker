import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { LabelBreakdownComponent } from './label-breakdown.component';

describe('LabelBreakdownComponent', () => {
  let component: LabelBreakdownComponent;
  let fixture: ComponentFixture<LabelBreakdownComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ LabelBreakdownComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(LabelBreakdownComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
