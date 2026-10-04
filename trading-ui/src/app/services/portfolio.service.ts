import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';
import { environment } from '../../environments/environment';

export interface PortfolioSummary {
  accountId: number;
  baseCurrency: string;
  cashBalance: number;
  marketValue: number;
  costBasis: number;
  unrealisedPnl: number;
  realisedPnl: number;
  totalValue: number;
  positionCount: number;
  partial: boolean;
  priceAsOf: string;
  asOf: string;
}

export interface PricedPosition {
  symbol: string;
  quantity: number;
  averageCost: number;
  costBasis: number;
  currency: string;
  lastPrice: number;
  marketValue: number;
  unrealisedPnl: number;
  stale: boolean;
  priceAsOf: string;
}

export interface PnlResponse {
  accountId: number;
  baseCurrency: string;
  realisedPnl: number;
  unrealisedPnl: number;
  totalPnl: number;
  asOf: string;
}

@Injectable({
  providedIn: 'root'
})
export class PortfolioService {
  private apiUrl = `${environment.tradeApiUrl}/api/v1/portfolio`;

  constructor(private http: HttpClient) {}

  getPortfolioSummary(accountId: number): Observable<PortfolioSummary> {
    return this.http.get<PortfolioSummary>(`${this.apiUrl}/${accountId}`).pipe(
      catchError(() => {
        throw new Error('Failed to load portfolio summary');
      })
    );
  }

  getPricedPositions(accountId: number, symbol?: string): Observable<PricedPosition[]> {
    let url = `${this.apiUrl}/${accountId}/positions`;
    if (symbol) {
      url += `?symbol=${encodeURIComponent(symbol)}`;
    }
    return this.http.get<PricedPosition[]>(url).pipe(
      catchError(() => {
        throw new Error('Failed to load positions');
      })
    );
  }

  getPnl(accountId: number): Observable<PnlResponse> {
    return this.http.get<PnlResponse>(`${this.apiUrl}/${accountId}/pnl`).pipe(
      catchError(() => {
        throw new Error('Failed to load P&L');
      })
    );
  }

  /**
   * Get top N positions by market value (for dashboard)
   */
  getTopPositions(accountId: number, limit: number = 5): Observable<PricedPosition[]> {
    return this.getPricedPositions(accountId).pipe(
      catchError((error) => {
        console.error('Failed to load top positions', error);
        return of([]); // Return empty array on error
      })
    );
  }
}
