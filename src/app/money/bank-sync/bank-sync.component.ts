import { Component, OnInit } from '@angular/core';
import { delay } from 'src/app/core/util';
import { DataService } from '../data.service';
import { Observable } from 'rxjs';
import { Account } from 'src/proto/model';

@Component({
  selector: 'app-bank-sync',
  templateUrl: './bank-sync.component.html',
  styleUrls: ['./bank-sync.component.css']
})
export class BankSyncComponent implements OnInit {
  readonly allAccounts$: Observable<Account[]>;

  targetAccounts: (Account | false)[] = [false, false, false, false];
  syncActive = false;
  syncLog: string | null = null;

  constructor(private readonly dataService: DataService) {
    this.allAccounts$ = this.dataService.accounts$;
  }

  ngOnInit() {
  }

  async onSubmit() {
    this.syncActive = true;
    this.syncLog = '[DUMMY] Loading stuff ...\n';
    for (let i = 0; i < 4; i++) {
      await delay(100);
      this.syncLog += '[DUMMY] Did the login.\n';
      await delay(70);
      this.syncLog += '[DUMMY] Baked some cookies.\n';
      await delay(550);
      this.syncLog += '[DUMMY] Also some toast now.\n';
      await delay(200);
      this.syncLog += '[DUMMY] Saying good bye to strangers ...\n';
    }
    await delay(800);
    this.syncLog += '[DUMMY] Done!\n';
    this.syncActive = false;
  }

}
