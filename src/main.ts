import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';
import { environment } from './environments/environment';


if (environment.production) {
  enableProdMode();
} else {
  document.title += " (DEV)";

  // Mark main toolbar in red.
  const devStyle = document.createElement("style");
  // WebKit hack
  devStyle.appendChild(document.createTextNode(""));
  document.head.appendChild(devStyle);
  (<any>devStyle.sheet).insertRule(".primary-toolbar { background-color: red !important; }");
  (<any>devStyle.sheet).insertRule(".app-title:after { content: ' (DEV)'; }");
}

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.log(err));
