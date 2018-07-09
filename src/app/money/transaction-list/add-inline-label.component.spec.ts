import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { AddInlineLabelComponent } from './add-inline-label.component';

describe('AddInlineLabelComponent', () => {
  let component: AddInlineLabelComponent;
  let fixture: ComponentFixture<AddInlineLabelComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ AddInlineLabelComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(AddInlineLabelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
