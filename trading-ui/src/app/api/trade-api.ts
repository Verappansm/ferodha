import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AccountsService } from './generated/trade/api/accounts.service';
import { OrdersService } from './generated/trade/api/orders.service';
import { AccountResponse } from './generated/trade/model/account-response';
import { BalanceResponse } from './generated/trade/model/balance-response';
import { OrderHistoryEntry } from './generated/trade/model/order-history-entry';
import { OrderResponse } from './generated/trade/model/order-response';
import { OrderSide } from './generated/trade/model/order-side';
import { OrderStatus } from './generated/trade/model/order-status';
import { PlaceOrderRequest } from './generated/trade/model/place-order-request';
import { PositionResponse } from './generated/trade/model/position-response';

export type {
  AccountResponse,
  BalanceResponse,
  OrderHistoryEntry,
  OrderResponse,
  PlaceOrderRequest,
  PositionResponse,
};
export { OrderSide, OrderStatus };

/**
 * The Trade REST API as the rest of the application uses it, over the client
 * generated from design/trade-api.yaml. One plain method per call.
 */
@Injectable({ providedIn: 'root' })
export class TradeApi {
  private readonly accounts = inject(AccountsService);
  private readonly orders = inject(OrdersService);

  account(accountId: number): Observable<AccountResponse> {
    return this.accounts.getAccount(accountId);
  }

  balance(accountId: number): Observable<BalanceResponse> {
    return this.accounts.getBalance(accountId);
  }

  positions(accountId: number): Observable<PositionResponse[]> {
    return this.accounts.getPositions(accountId);
  }

  orderHistory(accountId: number): Observable<OrderHistoryEntry[]> {
    return this.accounts.getOrders(accountId);
  }

  placeOrder(order: PlaceOrderRequest): Observable<OrderResponse> {
    return this.orders.placeOrder(order);
  }

  cancelOrder(orderId: string): Observable<OrderResponse> {
    return this.orders.cancelOrder(orderId);
  }
}
