import { Injectable } from '@angular/core';

@Injectable()
export class LoggerService {
  log(message: string) {
    console.log(message);
  }

  error(message: string, cause?: any) {
    console.error(message, cause);
  }
}
