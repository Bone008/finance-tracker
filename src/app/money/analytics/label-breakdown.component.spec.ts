import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { LabelBreakdownComponent } from './label-breakdown.component';

describe('LabelBreakdownComponent', () => {
  let component: LabelBreakdownComponent;
  let fixture: ComponentFixture<LabelBreakdownComponent>;

  beforeEach(async(() => {
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
