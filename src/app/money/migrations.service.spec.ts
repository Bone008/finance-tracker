import { TestBed } from '@angular/core/testing';

import { MigrationsService } from './migrations.service';

describe('MigrationsService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: MigrationsService = TestBed.get(MigrationsService);
    expect(service).toBeTruthy();
  });
});
