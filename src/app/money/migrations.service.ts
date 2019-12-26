import { Injectable } from '@angular/core';
import { DataContainer } from 'src/proto/model';

/** Processes hooks for preprocessing old migration data. */
@Injectable({
  providedIn: 'root'
})
export class MigrationsService {

  // Note: Currently cannot depend on DataService as it is invoked by it.
  // Design decision that may be changed.
  constructor() { }

  preprocessDataContainer(unused: DataContainer) {
    // Currently no supported migrations.
    // This used to contain the migration from isCash transactions to accounts.
  }

}
