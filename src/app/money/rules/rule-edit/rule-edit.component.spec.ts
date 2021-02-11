import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { RuleEditComponent } from './rule-edit.component';

describe('RuleEditComponent', () => {
  let component: RuleEditComponent;
  let fixture: ComponentFixture<RuleEditComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ RuleEditComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(RuleEditComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
