import { ComponentFixture, fakeAsync, TestBed, tick, waitForAsync } from '@angular/core/testing';
import { MatDialogModule } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { LoggerService } from 'src/app/core/logger.service';
import { DataContainer, LabelConfig } from 'src/proto/model';
import { makeBilling, makeTx } from 'src/testing/test-util';
import { DataService } from '../data.service';
import { MONEY_EPSILON } from '../model-util';
import { AnalyticsComponent } from './analytics.component';


fdescribe('AnalyticsComponent', () => {
  let component: AnalyticsComponent;
  let fixture: ComponentFixture<AnalyticsComponent>;

  let dataService: DataService;
  let routeFragmentSubject: Subject<string>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [AnalyticsComponent],
      imports: [MatDialogModule],
      providers: [
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate', 'navigateByUrl']) },
        { provide: ActivatedRoute, useValue: { fragment: routeFragmentSubject = new Subject() } },
        LoggerService,
      ],
    })
      .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(AnalyticsComponent);
    component = fixture.componentInstance;
    dataService = TestBed.inject(DataService);
    fixture.detectChanges();
  });


  it('should create', () => {
    expect(component).toBeTruthy();
  });


  it('should analyze transactions', fakeAsync(() => {
    dataService.setDataContainer(new DataContainer({
      transactions: [
        makeTx('2020-01-15', -42),
        makeTx('2020-01-16', -44),
      ]
    }));
    tick();

    expect(component.matchingTransactionCount).toBe(2, 'matchingTransactionCount');
    expect(component.totalTransactionCount).toBe(2, 'totalTransactionCount');
    expect(component.labelGroups).toEqual([]);
    expect(component.analysisResult.bucketUnit).toBe('month');
    expect(component.analysisResult.buckets.length).toBe(1);
    expect(component.analysisResult.buckets[0].name).toBe('2020-01');
    expect(component.analysisResult.buckets[0].totalExpenses).toBeCloseTo(-86, MONEY_EPSILON);
    expect(component.analysisResult.buckets[0].totalIncome).toBe(0);
  }));


  it('should split evenly across month buckets', fakeAsync(() => {
    dataService.setDataContainer(new DataContainer({
      labelConfigs: {
        'quarterly': new LabelConfig({ billing: makeBilling('month', {}, { month: 2 }, true) }),
      },
      transactions: [
        makeTx('2020-01-15', -100, ['default-billing']),
        makeTx('2020-01-16', 100, ['default-billing']),
        makeTx('2020-01-17', -90, ['quarterly']),
      ]
    }));
    tick();

    expect(component.matchingTransactionCount).toBe(3, 'matchingTransactionCount');
    expect(component.analysisResult.buckets.length).toBe(3);
    expect(component.analysisResult.buckets[0].name).toBe('2020-01');
    expect(component.analysisResult.buckets[0].totalExpenses).toBeCloseTo(-130, MONEY_EPSILON);
    expect(component.analysisResult.buckets[0].totalIncome).toBeCloseTo(100, MONEY_EPSILON);
    expect(component.analysisResult.buckets[1].name).toBe('2020-02');
    expect(component.analysisResult.buckets[1].totalExpenses).toBeCloseTo(-30, MONEY_EPSILON);
    expect(component.analysisResult.buckets[1].totalIncome).toBe(0);
    expect(component.analysisResult.buckets[2].name).toBe('2020-03');
    expect(component.analysisResult.buckets[2].totalExpenses).toBeCloseTo(-30, MONEY_EPSILON);
    expect(component.analysisResult.buckets[2].totalIncome).toBe(0);
  }));


  it('should split evenly across day buckets', fakeAsync(() => {
    dataService.setDataContainer(new DataContainer({
      labelConfigs: {
        'quarterly': new LabelConfig({ billing: makeBilling('month', {}, { month: 2 }, true) }),
      },
      transactions: [
        makeTx('2020-01-15', -100, ['default-billing']),
        makeTx('2020-01-16', 100, ['default-billing']),
        makeTx('2020-01-17', -91, ['quarterly']),
      ]
    }));
    component.bucketUnitSubject.next('day');
    tick();

    expect(component.matchingTransactionCount).toBe(3, 'matchingTransactionCount');
    expect(component.analysisResult.buckets.length).toBe(91);
    expect(component.analysisResult.buckets[14].name).toBe('2020-01-15');
    expect(component.analysisResult.buckets[14].totalExpenses).toBeCloseTo(-101, MONEY_EPSILON);
    expect(component.analysisResult.buckets[14].totalIncome).toBeCloseTo(0, MONEY_EPSILON);
    expect(component.analysisResult.buckets[15].name).toBe('2020-01-16');
    expect(component.analysisResult.buckets[15].totalExpenses).toBeCloseTo(-1, MONEY_EPSILON);
    expect(component.analysisResult.buckets[15].totalIncome).toBeCloseTo(100, MONEY_EPSILON);
    expect(component.analysisResult.buckets[0].name).toBe('2020-01-01');
    expect(component.analysisResult.buckets[0].totalExpenses).toBeCloseTo(-1, MONEY_EPSILON);
    expect(component.analysisResult.buckets[0].totalIncome).toBeCloseTo(0, MONEY_EPSILON);
    expect(component.analysisResult.buckets[33].name).toBe('2020-02-03');
    expect(component.analysisResult.buckets[33].totalExpenses).toBeCloseTo(-1, MONEY_EPSILON);
    expect(component.analysisResult.buckets[33].totalIncome).toBeCloseTo(0, MONEY_EPSILON);
  }));


  it('should respect splitting date filter in all bucket sizes', fakeAsync(() => {
    dataService.setDataContainer(new DataContainer({
      transactions: [
        makeTx('2020-01-15', -100, ['dummy']),
        makeTx('2020-01-16', -100, ['dummy']),
        makeTx('2020-01-25', -100, ['billed-out-of-range'], makeBilling('month', { year: 2019, month: 12, day: 1 })),
        makeTx('2020-01-17', -40),
        // Should include 1/3 of billed days.
        makeTx('2018-06-01', -30, ['billed-partially'], makeBilling('day', { year: 2020, month: 1, day: 15 }, { year: 2020, month: 1, day: 17 })),
      ]
    }));
    component.filterState.setValueNow('date>=2020-01-17');
    component.bucketUnitSubject.next('day');
    tick();

    expect(component.matchingTransactionCount).toBe(2, 'matchingTransactionCount');
    expect(component.analysisResult.buckets.length).toBe(1);
    expect(component.analysisResult.buckets[0].name).toBe('2020-01-17');
    expect(component.analysisResult.buckets[0].totalExpenses).toBeCloseTo(-50, MONEY_EPSILON, 'for daily buckets');

    component.bucketUnitSubject.next('month');
    tick();

    expect(component.analysisResult.buckets.length).toBe(1);
    expect(component.analysisResult.buckets[0].name).toBe('2020-01');
    expect(component.analysisResult.buckets[0].totalExpenses).toBeCloseTo(-50, MONEY_EPSILON, 'for monthly buckets');

    component.bucketUnitSubject.next('year');
    tick();

    expect(component.analysisResult.buckets.length).toBe(1);
    expect(component.analysisResult.buckets[0].name).toBe('2020');
    expect(component.analysisResult.buckets[0].totalExpenses).toBeCloseTo(-50, MONEY_EPSILON, 'for yearly buckets');
  }));


  it('should divide unevenly between years when necessary', fakeAsync(() => {
    dataService.setDataContainer(new DataContainer({
      labelConfigs: {
        'quarterly': new LabelConfig({ billing: makeBilling('month', {}, { month: 2 }, true) }),
      },
      transactions: [
        makeTx('2019-11-15', -150, ['quarterly']),
      ]
    }));
    component.bucketUnitSubject.next('year');
    tick();

    expect(component.analysisResult.buckets.length).toBe(2);
    expect(component.analysisResult.buckets[0].name).toBe('2019');
    expect(component.analysisResult.buckets[0].totalExpenses).toBeCloseTo(-100, MONEY_EPSILON);
    expect(component.analysisResult.buckets[1].name).toBe('2020');
    expect(component.analysisResult.buckets[1].totalExpenses).toBeCloseTo(-50, MONEY_EPSILON);
  }));


  it('should collapse hierarchical labels by default', fakeAsync(() => {
    dataService.setDataContainer(new DataContainer({
      transactions: [
        makeTx('2020-01-15', -42, ['foo/bar']),
        makeTx('2020-01-16', -44, ['dog']),
        makeTx('2020-01-17', -46, ['foo/banana']),
      ]
    }));
    tick();

    expect(component.labelGroups).toEqual([{ parentName: 'foo', children: ['bar', 'banana'] }]);
    expect(component.shouldCollapseGroup('foo')).toBe(true);
  }));

  it('should not collapse hierarchical labels when excluded in fragment', fakeAsync(() => {
    dataService.setDataContainer(new DataContainer({
      transactions: [
        makeTx('2020-01-15', -42, ['foo/bar']),
        makeTx('2020-01-16', -44, ['dog']),
        makeTx('2020-01-17', -46, ['foo/banana']),
      ]
    }));
    routeFragmentSubject.next('collapse=!foo');
    tick();

    expect(component.labelGroups).toEqual([{ parentName: 'foo', children: ['bar', 'banana'] }]);
    expect(component.shouldCollapseGroup('foo')).toBe(false);
  }));

  it('should not collapse hierarchical labels when excluded by subject', fakeAsync(() => {
    dataService.setDataContainer(new DataContainer({
      transactions: [
        makeTx('2020-01-15', -42, ['foo/bar']),
        makeTx('2020-01-16', -44, ['dog']),
        makeTx('2020-01-17', -46, ['foo/banana']),
      ]
    }));
    component.uncollapsedGroupsSubject.next(new Set(['foo']));
    tick();

    expect(component.labelGroups).toEqual([{ parentName: 'foo', children: ['bar', 'banana'] }]);
    expect(component.shouldCollapseGroup('foo')).toBe(false);
  }));
});
