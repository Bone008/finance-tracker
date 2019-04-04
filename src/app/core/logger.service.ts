import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';

@Injectable()
export class LoggerService {
  log(message: any, ...optionalParams: any[]) {
    console.log(message, ...optionalParams);
  }

  warn(message: string, ...optionalParams: any[]) {
    console.warn(message, ...optionalParams);
  }

  error(message: string, cause?: any) {
    console.error(message, cause);
  }

  /** Logs a message to console only in debug mode. */
  debug(message: any, ...optionalParams: any[]) {
    if (!environment.production) {
      console.log('[DEBUG]', message, ...optionalParams);
    }
  }
}
