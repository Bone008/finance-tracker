import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { MoneyComponent } from './money.component';

describe('MoneyComponent', () => {
  let component: MoneyComponent;
  let fixture: ComponentFixture<MoneyComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ MoneyComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(MoneyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
