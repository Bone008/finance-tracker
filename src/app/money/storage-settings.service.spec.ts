import { TestBed, inject } from '@angular/core/testing';

import { StorageSettingsService } from './storage-settings.service';

describe('StorageSettingsService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [StorageSettingsService]
    });
  });

  it('should be created', inject([StorageSettingsService], (service: StorageSettingsService) => {
    expect(service).toBeTruthy();
  }));
});
