import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { DialogLabelDominanceComponent } from './dialog-label-dominance.component';

describe('DialogLabelDominanceComponent', () => {
  let component: DialogLabelDominanceComponent;
  let fixture: ComponentFixture<DialogLabelDominanceComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ DialogLabelDominanceComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(DialogLabelDominanceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
