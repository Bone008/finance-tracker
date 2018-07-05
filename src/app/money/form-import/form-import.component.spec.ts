import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { FormImportComponent } from './form-import.component';

describe('FormImportComponent', () => {
  let component: FormImportComponent;
  let fixture: ComponentFixture<FormImportComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ FormImportComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(FormImportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
