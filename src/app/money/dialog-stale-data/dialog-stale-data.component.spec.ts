import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { DialogStaleDataComponent } from './dialog-stale-data.component';

describe('DialogStaleDataComponent', () => {
  let component: DialogStaleDataComponent;
  let fixture: ComponentFixture<DialogStaleDataComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ DialogStaleDataComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(DialogStaleDataComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
