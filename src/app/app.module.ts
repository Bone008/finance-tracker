import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AppComponent } from './app.component';
import { MaterialModule } from './material.module';
import { CoreModule } from './core/core.module';
import { MoneyModule } from './money/money.module';

@NgModule({
  declarations: [
    AppComponent,
  ],
  imports: [
    BrowserModule,
    FormsModule,
    MaterialModule,
    CoreModule,
    MoneyModule,
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
