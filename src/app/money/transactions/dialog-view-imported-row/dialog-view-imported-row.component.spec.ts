import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { DialogViewImportedRowComponent } from './dialog-view-imported-row.component';

describe('DialogViewImportedRowComponent', () => {
  let component: DialogViewImportedRowComponent;
  let fixture: ComponentFixture<DialogViewImportedRowComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ DialogViewImportedRowComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(DialogViewImportedRowComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
