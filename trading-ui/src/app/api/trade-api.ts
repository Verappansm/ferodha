import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AccountsService } from './generated/trade/api/accounts.service';
import { OrdersService } from './generated/trade/api/orders.service';
import { InstrumentsService } from './generated/trade/api/instruments.service';
import { FeesService } from './generated/trade/api/fees.service';
import { AccountResponse } from './generated/trade/model/account-response';
import { BalanceResponse } from './generated/trade/model/balance-response';
import { OrderHistoryEntry } from './generated/trade/model/order-history-entry';
import { OrderResponse } from './generated/trade/model/order-response';
import { OrderSide } from './generated/trade/model/order-side';
import { OrderStatus } from './generated/trade/model/order-status';
import { PlaceOrderRequest } from './generated/trade/model/place-order-request';
import { PositionResponse } from './generated/trade/model/position-response';
import { InstrumentResponse } from './generated/trade/model/instrument-response';
import { InstrumentType } from './generated/trade/model/instrument-type';
import { PaginatedInstrumentsResponse } from './generated/trade/model/paginated-instruments-response';
import { InstrumentQuote } from './generated/trade/model/instrument-quote';
import { PriceHistory } from './generated/trade/model/price-history';
import { PricePoint } from './generated/trade/model/price-point';
import { PriceSnapshot } from './generated/trade/model/price-snapshot';
import { FeeSchedule } from './generated/trade/model/fee-schedule';

export type {
  FeeSchedule,
  AccountResponse,
  BalanceResponse,
  OrderHistoryEntry,
  OrderResponse,
  PlaceOrderRequest,
  PositionResponse,
  InstrumentResponse,
  PaginatedInstrumentsResponse,
  InstrumentQuote,
  PricePoint,
  PriceSnapshot,
};
export { OrderSide, OrderStatus, InstrumentType, PriceHistory };

/** Filters for order history, passed to the route's own query parameters. */
export interface OrderFilter {
  status?: OrderStatus;
  from?: string;
  to?: string;
}

/** The chart ranges the Trade REST API serves: minute bars for 1D, daily candles otherwise. */
export type ChartRange = PriceHistory.RangeEnum;

/**
 * The Trade REST API as the rest of the application uses it, over the client
 * generated from design/trade-api.yaml. One plain method per call.
 */
@Injectable({ providedIn: 'root' })
export class TradeApi {
  private readonly accounts = inject(AccountsService);
  private readonly orders = inject(OrdersService);
  private readonly instruments = inject(InstrumentsService);
  private readonly fees = inject(FeesService);

  account(accountId: number): Observable<AccountResponse> {
    return this.accounts.getAccount(accountId);
  }

  balance(accountId: number): Observable<BalanceResponse> {
    return this.accounts.getBalance(accountId);
  }

  positions(accountId: number): Observable<PositionResponse[]> {
    return this.accounts.getPositions(accountId);
  }

  /** Order history, optionally narrowed to one status and a placed-on window (ISO date-times). */
  orderHistory(accountId: number, filter?: OrderFilter): Observable<OrderHistoryEntry[]> {
    return filter
      ? this.accounts.getOrders(accountId, filter.status, filter.from, filter.to)
      : this.accounts.getOrders(accountId);
  }

  placeOrder(order: PlaceOrderRequest): Observable<OrderResponse> {
    return this.orders.placeOrder(order);
  }

  /**
   * Cancels a working order. The contract takes the bare UUID in the path,
   * "without the ORD- display prefix" that order history shows.
   */
  cancelOrder(orderId: string): Observable<OrderResponse> {
    return this.orders.cancelOrder(orderId.replace(/^ORD-/, ''));
  }

  getInstruments(pageSize?: number, offset?: number): Observable<PaginatedInstrumentsResponse> {
    return this.instruments.getInstruments(pageSize, offset);
  }

  instrument(symbol: string): Observable<InstrumentResponse> {
    return this.instruments.getInstrument(symbol);
  }

  /** The latest price of up to 100 instruments in one request (the market list). */
  prices(symbols: string[]): Observable<PriceSnapshot[]> {
    return this.instruments.getInstrumentPrices(symbols);
  }

  quote(symbol: string): Observable<InstrumentQuote> {
    return this.instruments.getInstrumentQuote(symbol);
  }

  history(symbol: string, range: ChartRange): Observable<PriceHistory> {
    return this.instruments.getInstrumentHistory(symbol, range);
  }

  /** The commission rate the executor charges on a fill, for the ticket's estimate (LEAP-017). */
  feeSchedule(): Observable<FeeSchedule> {
    return this.fees.getFeeSchedule();
  }
}
