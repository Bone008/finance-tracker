import { Component, OnInit, ViewChild } from '@angular/core';
import { MatAutocompleteTrigger } from '@angular/material/autocomplete';
import { delay } from 'src/app/core/util';

@Component({
  selector: 'app-presets',
  templateUrl: './presets.component.html',
  styleUrls: ['./presets.component.css']
})
export class PresetsComponent implements OnInit {

  constructor() { }

  ngOnInit() {
  }

  @ViewChild(MatAutocompleteTrigger, { static: true })
  presetsPanelTrigger: MatAutocompleteTrigger;

  async openPresetsPanel() {
    // Delay is necessary since otherwise the button immediately gets back focus
    // and the panel is closed again.
    await delay(0);
    this.presetsPanelTrigger.openPanel();
  }

  addNewPreset() {
    console.log('adding new preset');
  }

  selectPreset(preset: string) {
    // TODO: Do something with selection.
    console.log('selected:', preset);
  }

}
