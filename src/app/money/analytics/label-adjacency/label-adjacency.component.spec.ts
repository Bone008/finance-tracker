import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { LabelAdjacencyComponent } from './label-adjacency.component';

describe('LabelAdjacencyComponent', () => {
  let component: LabelAdjacencyComponent;
  let fixture: ComponentFixture<LabelAdjacencyComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ LabelAdjacencyComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(LabelAdjacencyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
