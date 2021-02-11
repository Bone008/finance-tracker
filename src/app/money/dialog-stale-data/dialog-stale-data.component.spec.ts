import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { DialogStaleDataComponent } from './dialog-stale-data.component';

describe('DialogStaleDataComponent', () => {
  let component: DialogStaleDataComponent;
  let fixture: ComponentFixture<DialogStaleDataComponent>;

  beforeEach(waitForAsync(() => {
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
