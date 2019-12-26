import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { environment } from "src/environments/environment";

export interface BankSyncRequest {
  bankType: 'sparkasse';
  bankUrl: string;
  loginName: string;
  loginPassword: string;
  maxTransactionAge: number;
  accountIndices: number[];
  verbose?: boolean;
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
    if (!environment.production) {
      request.verbose = true;
    }
    return this.httpClient.post<BankSyncResponse>('/api/banksync', request);
  }
}