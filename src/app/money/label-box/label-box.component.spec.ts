import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { LabelBoxComponent } from './label-box.component';

describe('LabelBoxComponent', () => {
  let component: LabelBoxComponent;
  let fixture: ComponentFixture<LabelBoxComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ LabelBoxComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(LabelBoxComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
