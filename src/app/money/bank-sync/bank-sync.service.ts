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

export interface BankSyncResult {
  data: string;
  log: string;
}
export interface BankSyncSuccessResponse {
  success: true;
  results: BankSyncResult[];
}
export interface BankSyncErrorResponse {
  success: undefined;
  error: string;
  errorDetails?: string;
}
export type BankSyncResponse = BankSyncSuccessResponse | BankSyncErrorResponse;

@Injectable({
  providedIn: 'root'
})
export class BankSyncService {
  constructor(
    private readonly httpClient: HttpClient
  ) { }

  requestSync(request: BankSyncRequest): Observable<BankSyncResponse> {
    return this.httpClient.post<BankSyncResponse>('/api/banksync', request);
  }
}