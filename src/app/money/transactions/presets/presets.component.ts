import { Component, OnInit, ViewChild } from '@angular/core';
import { MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { delay } from 'src/app/core/util';
import { Transaction, TransactionData, TransactionPreset } from 'src/proto/model';
import { DataService } from '../../data.service';
import { DialogService } from '../../dialog.service';
import { MODE_PRESET } from '../transaction-edit/transaction-edit.component';

@Component({
  selector: 'app-presets',
  templateUrl: './presets.component.html',
  styleUrls: ['./presets.component.css']
})
export class PresetsComponent implements OnInit {
  readonly presets$: Observable<TransactionPreset[]>;

  @ViewChild(MatAutocompleteTrigger, { static: true })
  presetsPanelTrigger: MatAutocompleteTrigger;

  constructor(
    private readonly dataService: DataService,
    private readonly dialogService: DialogService
  ) {
    this.presets$ = this.dataService.transactionPresets$
      .pipe(map(presets => presets.sort((a, b) => a.name.localeCompare(b.name))));
  }

  ngOnInit() {
  }

  startAddPreset() {
    const preset = new TransactionPreset({
      allowModification: true,
      transaction: new Transaction({
        single: new TransactionData({
          accountId: this.dataService.getUserSettings().defaultAccountIdOnAdd,
        }),
      }),
    });

    this.dialogService.openTransactionEdit(preset.transaction!, MODE_PRESET, preset)
      .afterConfirmed().subscribe(() => {
        this.dataService.addTransactionPresets(preset);
      });
  }

  selectPreset(preset: string) {
    // TODO: Do something with selection.
    console.log('selected:', preset);
  }

  async openPresetsPanel() {
    // Delay is necessary since otherwise the button immediately gets back focus
    // and the panel is closed again.
    await delay(0);
    this.presetsPanelTrigger.openPanel();
  }

}
