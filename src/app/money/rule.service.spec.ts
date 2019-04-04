import { TestBed, inject } from '@angular/core/testing';

import { RuleService } from './rule.service';

describe('RuleService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [RuleService]
    });
  });

  it('should be created', inject([RuleService], (service: RuleService) => {
    expect(service).toBeTruthy();
  }));
});
