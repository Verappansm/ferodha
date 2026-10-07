import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AccountsService } from './generated/trade/api/accounts.service';
import { OrdersService } from './generated/trade/api/orders.service';
import { InstrumentsService } from './generated/trade/api/instruments.service';
import { AccountResponse } from './generated/trade/model/account-response';
import { BalanceResponse } from './generated/trade/model/balance-response';
import { OrderHistoryEntry } from './generated/trade/model/order-history-entry';
import { OrderResponse } from './generated/trade/model/order-response';
import { OrderStatus } from './generated/trade/model/order-status';
import { PlaceOrderRequest } from './generated/trade/model/place-order-request';
import { PositionResponse } from './generated/trade/model/position-response';
import { InstrumentResponse } from './generated/trade/model/instrument-response';
import { PaginatedInstrumentsResponse } from './generated/trade/model/paginated-instruments-response';
import { InstrumentQuote } from './generated/trade/model/instrument-quote';
import { PriceHistory } from './generated/trade/model/price-history';
import { PriceSnapshot } from './generated/trade/model/price-snapshot';
import { OrderReviewRequest } from './generated/trade/model/order-review-request';
import { OrderReviewResponse } from './generated/trade/model/order-review-response';
import { environment } from '../../environments/environment';

export type { AccountResponse } from './generated/trade/model/account-response';
export type { BalanceResponse } from './generated/trade/model/balance-response';
export type { OrderHistoryEntry } from './generated/trade/model/order-history-entry';
export type { OrderResponse } from './generated/trade/model/order-response';
export type { PlaceOrderRequest } from './generated/trade/model/place-order-request';
export type { PositionResponse } from './generated/trade/model/position-response';
export type { InstrumentResponse } from './generated/trade/model/instrument-response';
export type { PaginatedInstrumentsResponse } from './generated/trade/model/paginated-instruments-response';
export type { InstrumentQuote } from './generated/trade/model/instrument-quote';
export type { PricePoint } from './generated/trade/model/price-point';
export type { PriceSnapshot } from './generated/trade/model/price-snapshot';
export { OrderSide } from './generated/trade/model/order-side';
export { OrderStatus } from './generated/trade/model/order-status';
export { InstrumentType } from './generated/trade/model/instrument-type';
export { PriceHistory } from './generated/trade/model/price-history';
export type { OrderReviewRequest } from './generated/trade/model/order-review-request';
export type { OrderReviewResponse } from './generated/trade/model/order-review-response';

/** Filters for order history, passed to the route's own query parameters. */
export interface OrderFilter {
  status?: OrderStatus;
  from?: string;
  to?: string;
}

/** Automated strategies (/api/v1/strategies), hand-written like the watchlist DTOs. */
export type StrategyStatus = 'DISABLED' | 'ENABLED' | 'TRIPPED' | 'COMPLETED' | 'EXPIRED';

export interface StrategyResponse {
  strategyId: string;
  name: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  triggerPrice: number;
  quantity: number;
  maxSpend: number | null;
  maxPosition: number | null;
  maxOrders: number;
  maxFailures: number;
  dryRun: boolean;
  status: StrategyStatus;
  ordersPlaced: number;
  consecutiveFailures: number;
  expiresAt: string | null;
  createdAt: string;
  /** The price it last watched (the ask for a BUY, the bid for a SELL) and when. */
  lastPrice: number | null;
  lastCheckedAt: string | null;
}

export interface StrategyEventResponse {
  at: string;
  kind: string;
  detail: string | null;
}

export interface CreateStrategyRequest {
  name: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  triggerPrice: number;
  quantity: number;
  maxSpend: number | null;
  maxPosition: number | null;
  maxOrders: number;
  maxFailures: number;
  dryRun: boolean;
  expiresAt: string | null;
}

/** Watchlist DTOs (manually defined since OpenAPI spec has issues) */
export interface WatchlistResponse {
  watchlistId: string;
  name: string;
  displayOrder: number;
  items: WatchlistItemResponse[];
}

export interface WatchlistItemResponse {
  itemId: string;
  instrumentId: string;
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  sector: string | null;
  lastPrice: number;
  dayChange: number;
  dayChangePercent: number;
  lastUpdated: string | null;
  addedAt: string;
  displayOrder: number;
  intradayData: IntradayPricePoint[];
}

export interface IntradayPricePoint {
  timestamp: string;
  price: number;
}

export interface CreateWatchlistRequest {
  name: string;
}

export interface AddWatchlistItemRequest {
  symbol: string;
  watchlistId: string;
}

export interface BulkAddWatchlistItemsRequest {
  symbol: string;
  watchlistIds: string[];
}

export interface ReorderWatchlistItemsRequest {
  itemOrderMap: Record<string, number>;
}

export interface UpdateWatchlistRequest {
  name?: string;
  displayOrder?: number;
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
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.tradeApiUrl || 'http://localhost:8080';

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

  getInstruments(
    pageSize?: number,
    offset?: number,
    search?: string,
  ): Observable<PaginatedInstrumentsResponse> {
    return this.instruments.getInstruments(pageSize, offset, search);
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

  // ===== Strategies API =====

  strategies(): Observable<StrategyResponse[]> {
    return this.http.get<StrategyResponse[]>(`${this.baseUrl}/api/v1/strategies`);
  }

  createStrategy(request: CreateStrategyRequest): Observable<StrategyResponse> {
    return this.http.post<StrategyResponse>(`${this.baseUrl}/api/v1/strategies`, request);
  }

  enableStrategy(strategyId: string): Observable<StrategyResponse> {
    return this.http.post<StrategyResponse>(
      `${this.baseUrl}/api/v1/strategies/${strategyId}/enable`,
      {},
    );
  }

  disableStrategy(strategyId: string): Observable<StrategyResponse> {
    return this.http.post<StrategyResponse>(
      `${this.baseUrl}/api/v1/strategies/${strategyId}/disable`,
      {},
    );
  }

  strategyEvents(strategyId: string): Observable<StrategyEventResponse[]> {
    return this.http.get<StrategyEventResponse[]>(
      `${this.baseUrl}/api/v1/strategies/${strategyId}/events`,
    );
  }

  // ===== Watchlist API =====

  /** Get all watchlists for the current user */
  getWatchlists(): Observable<WatchlistResponse[]> {
    return this.http.get<WatchlistResponse[]>(`${this.baseUrl}/api/v1/watchlists`);
  }

  /** Get a specific watchlist with its items */
  getWatchlist(watchlistId: string): Observable<WatchlistResponse> {
    return this.http.get<WatchlistResponse>(`${this.baseUrl}/api/v1/watchlists/${watchlistId}`);
  }

  /** Create a new watchlist */
  createWatchlist(request: CreateWatchlistRequest): Observable<WatchlistResponse> {
    return this.http.post<WatchlistResponse>(`${this.baseUrl}/api/v1/watchlists`, request);
  }

  /** Update a watchlist (name or display order) */
  updateWatchlist(
    watchlistId: string,
    request: UpdateWatchlistRequest,
  ): Observable<WatchlistResponse> {
    return this.http.patch<WatchlistResponse>(
      `${this.baseUrl}/api/v1/watchlists/${watchlistId}`,
      request,
    );
  }

  /** Delete a watchlist */
  deleteWatchlist(watchlistId: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/api/v1/watchlists/${watchlistId}`);
  }

  /** Get all items in a watchlist */
  getWatchlistItems(watchlistId: string): Observable<WatchlistItemResponse[]> {
    return this.http.get<WatchlistItemResponse[]>(
      `${this.baseUrl}/api/v1/watchlists/${watchlistId}/items`,
    );
  }

  /** Add an instrument to a watchlist */
  addWatchlistItem(
    watchlistId: string,
    request: AddWatchlistItemRequest,
  ): Observable<WatchlistItemResponse> {
    return this.http.post<WatchlistItemResponse>(
      `${this.baseUrl}/api/v1/watchlists/${watchlistId}/items`,
      request,
    );
  }

  /** Add an instrument to multiple watchlists at once */
  addWatchlistItemsBulk(
    request: BulkAddWatchlistItemsRequest,
  ): Observable<WatchlistItemResponse[]> {
    return this.http.post<WatchlistItemResponse[]>(
      `${this.baseUrl}/api/v1/watchlists/items/bulk`,
      request,
    );
  }

  /** Remove an instrument from a watchlist */
  removeWatchlistItem(watchlistId: string, itemId: string): Observable<void> {
    return this.http.delete<void>(
      `${this.baseUrl}/api/v1/watchlists/${watchlistId}/items/${itemId}`,
    );
  }

  /** Reorder items in a watchlist */
  reorderWatchlistItems(
    watchlistId: string,
    request: ReorderWatchlistItemsRequest,
  ): Observable<void> {
    return this.http.patch<void>(
      `${this.baseUrl}/api/v1/watchlists/${watchlistId}/items/reorder`,
      request,
    );
  }

  /**
   * The review step's figures (LEAP-017): cost, fee and total for the ticket
   * as typed, worked out by trade_api. Creates no order.
   */
  reviewOrder(order: OrderReviewRequest): Observable<OrderReviewResponse> {
    return this.orders.reviewOrder(order);
  }
}
