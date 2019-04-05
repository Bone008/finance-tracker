import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { LabelChipComponent } from './label-chip.component';


describe('LabelChipComponent', () => {
  let component: LabelChipComponent;
  let fixture: ComponentFixture<LabelChipComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ LabelChipComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(LabelChipComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
