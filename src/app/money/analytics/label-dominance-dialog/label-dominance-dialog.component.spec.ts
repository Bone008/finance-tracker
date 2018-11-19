import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { LabelDominanceDialogComponent } from './label-dominance-dialog.component';

describe('LabelDominanceDialogComponent', () => {
  let component: LabelDominanceDialogComponent;
  let fixture: ComponentFixture<LabelDominanceDialogComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ LabelDominanceDialogComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(LabelDominanceDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
