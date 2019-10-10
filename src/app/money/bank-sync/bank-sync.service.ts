import { Injectable } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";

export interface BankSyncRequest {
  bankType: 'sparkasse';
  bankUrl: string;
  loginName: string;
  loginPassword: string;
  maxTransactionAge: number;
  accountIndices: number[];
}

@Injectable({
  providedIn: 'root'
})
export class BankSyncService {
  constructor(
    private readonly httpClient: HttpClient
  ) { }

  requestSync(request: BankSyncRequest): Observable<any> {
    return this.httpClient.post('/api/banksync', request);
  }
}