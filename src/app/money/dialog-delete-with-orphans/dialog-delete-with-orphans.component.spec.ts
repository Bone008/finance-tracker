import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { DialogDeleteWithOrphansComponent } from './dialog-delete-with-orphans.component';

describe('DialogDeleteWithOrphansComponent', () => {
  let component: DialogDeleteWithOrphansComponent;
  let fixture: ComponentFixture<DialogDeleteWithOrphansComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ DialogDeleteWithOrphansComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(DialogDeleteWithOrphansComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
