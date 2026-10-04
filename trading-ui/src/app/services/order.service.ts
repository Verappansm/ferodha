import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface Order {
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  orderType: 'MARKET' | 'LIMIT';
  limitPrice?: number;
  status: 'PENDING' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELLED' | 'REJECTED';
  filledQuantity: number;
  averageFillPrice?: number;
  createdAt: string;
  updatedAt: string;
  accountId: number;
}

@Injectable({
  providedIn: 'root'
})
export class OrderService {
  private apiUrl = `${environment.tradeApiUrl}/api/v1/orders`;

  constructor(private http: HttpClient) {}

  getOrders(accountId: number, limit: number = 10): Observable<Order[]> {
    return this.http.get<Order[]>(`${this.apiUrl}?accountId=${accountId}&limit=${limit}`).pipe(
      catchError(() => {
        throw new Error('Failed to load orders');
      })
    );
  }

  getRecentOrders(accountId: number, limit: number = 5): Observable<Order[]> {
    return this.getOrders(accountId, limit).pipe(
      map((orders) =>
        // Sort by most recent first
        orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      ),
      catchError((error) => {
        console.error('Failed to load recent orders', error);
        return of([]); // Return empty array on error
      })
    );
  }
}
