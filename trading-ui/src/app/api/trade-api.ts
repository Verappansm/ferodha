import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AccountsService } from './generated/trade/api/accounts.service';
import { OrdersService } from './generated/trade/api/orders.service';
import { InstrumentsService } from './generated/trade/api/instruments.service';
import { WatchlistsService } from './generated/watchlist/api/watchlists.service';
import { PriceAlertsService } from './generated/watchlist/api/price-alerts.service';
import { StrategiesService } from './generated/strategy/api/strategies.service';
import { AccountResponse } from './generated/trade/model/account-response';
import { BalanceResponse } from './generated/trade/model/balance-response';
import { BankFundsResponse } from './generated/trade/model/bank-funds-response';
import { BankTransactionsResponse } from './generated/trade/model/bank-transactions-response';
import { BankTransferRequest } from './generated/trade/model/bank-transfer-request';
import { InstrumentFilters } from './generated/trade/model/instrument-filters';
import { InstrumentType } from './generated/trade/model/instrument-type';
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
import { WatchlistResponse } from './generated/watchlist/model/watchlist-response';
import { WatchlistItemResponse } from './generated/watchlist/model/watchlist-item-response';
import { CreateWatchlistRequest } from './generated/watchlist/model/create-watchlist-request';
import { UpdateWatchlistRequest } from './generated/watchlist/model/update-watchlist-request';
import { AddWatchlistItemRequest } from './generated/watchlist/model/add-watchlist-item-request';
import { BulkAddWatchlistItemsRequest } from './generated/watchlist/model/bulk-add-watchlist-items-request';
import { ReorderWatchlistItemsRequest } from './generated/watchlist/model/reorder-watchlist-items-request';
import { CreatePriceAlertRequest } from './generated/watchlist/model/create-price-alert-request';
import { UpdatePriceAlertRequest } from './generated/watchlist/model/update-price-alert-request';
import { PriceAlertResponse } from './generated/watchlist/model/price-alert-response';
import { StrategyResponse } from './generated/strategy/model/strategy-response';
import { StrategyEventResponse } from './generated/strategy/model/strategy-event-response';
import { CreateStrategyRequest } from './generated/strategy/model/create-strategy-request';

export type { AccountResponse } from './generated/trade/model/account-response';
export type { BalanceResponse } from './generated/trade/model/balance-response';
export type { BankFundsResponse } from './generated/trade/model/bank-funds-response';
export type { BankTransaction } from './generated/trade/model/bank-transaction';
export type { BankTransactionsResponse } from './generated/trade/model/bank-transactions-response';
export type { BankTransferRequest } from './generated/trade/model/bank-transfer-request';
export type { InstrumentFilters } from './generated/trade/model/instrument-filters';
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
export type { WatchlistResponse } from './generated/watchlist/model/watchlist-response';
export type { WatchlistItemResponse } from './generated/watchlist/model/watchlist-item-response';
export type { IntradayPricePoint } from './generated/watchlist/model/intraday-price-point';
export type { CreateWatchlistRequest } from './generated/watchlist/model/create-watchlist-request';
export type { UpdateWatchlistRequest } from './generated/watchlist/model/update-watchlist-request';
export type { AddWatchlistItemRequest } from './generated/watchlist/model/add-watchlist-item-request';
export type { BulkAddWatchlistItemsRequest } from './generated/watchlist/model/bulk-add-watchlist-items-request';
export type { ReorderWatchlistItemsRequest } from './generated/watchlist/model/reorder-watchlist-items-request';
export type { CreatePriceAlertRequest } from './generated/watchlist/model/create-price-alert-request';
export type { UpdatePriceAlertRequest } from './generated/watchlist/model/update-price-alert-request';
export type { PriceAlertResponse } from './generated/watchlist/model/price-alert-response';
export { AlertStatus } from './generated/watchlist/model/alert-status';
export type { StrategyResponse } from './generated/strategy/model/strategy-response';
export type { StrategyEventResponse } from './generated/strategy/model/strategy-event-response';
export type { CreateStrategyRequest } from './generated/strategy/model/create-strategy-request';
export { StrategyStatus } from './generated/strategy/model/strategy-status';

/** Filters for order history, passed to the route's own query parameters. */
export interface OrderFilter {
  status?: OrderStatus;
  from?: string;
  to?: string;
}

/** The market list's filters (LEAP-015); every one is optional and they combine. */
export interface InstrumentQuery {
  search?: string;
  exchange?: string;
  sector?: string;
  type?: InstrumentType;
}

export type BankTransferType = 'DEPOSIT' | 'WITHDRAWAL';

/** The chart ranges the Trade REST API serves: minute bars for 1D, daily candles otherwise. */
export type ChartRange = PriceHistory.RangeEnum;

/**
 * The Trade REST API as the rest of the application uses it, over the clients
 * generated from design/trade-api.yaml, watchlist-api.yaml and
 * strategy-api.yaml. One plain method per call; nothing here builds a URL.
 */
@Injectable({ providedIn: 'root' })
export class TradeApi {
  private readonly accounts = inject(AccountsService);
  private readonly orders = inject(OrdersService);
  private readonly instruments = inject(InstrumentsService);
  private readonly watchlists = inject(WatchlistsService);
  private readonly alerts = inject(PriceAlertsService);
  private readonly strategiesApi = inject(StrategiesService);

  account(accountId: number): Observable<AccountResponse> {
    return this.accounts.getAccount(accountId);
  }

  balance(accountId: number): Observable<BalanceResponse> {
    return this.accounts.getBalance(accountId);
  }

  bankFunds(accountId: number): Observable<BankFundsResponse> {
    return this.accounts.getBankFunds(accountId);
  }

  bankTransfer(
    accountId: number,
    type: BankTransferType,
    request: BankTransferRequest,
  ): Observable<BankFundsResponse> {
    return type === 'DEPOSIT'
      ? this.accounts.depositBankFunds(accountId, request)
      : this.accounts.withdrawBankFunds(accountId, request);
  }

  /** LEAP-019: the account's cash movements, newest first. */
  bankTransactions(accountId: number, limit = 50, offset = 0): Observable<BankTransactionsResponse> {
    return this.accounts.getBankTransactions(accountId, limit, offset);
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

  /** A page of tradable instruments, searched and filtered on the server (LEAP-015). */
  getInstruments(
    pageSize?: number,
    offset?: number,
    query: string | InstrumentQuery = {},
  ): Observable<PaginatedInstrumentsResponse> {
    const q: InstrumentQuery = typeof query === 'string' ? { search: query } : query;
    return this.instruments.getInstruments(
      pageSize,
      offset,
      q.search?.trim() || undefined,
      q.exchange || undefined,
      q.sector || undefined,
      q.type || undefined,
    );
  }

  /** The exchanges, sectors and types to filter by, from the data. */
  instrumentFilters(): Observable<InstrumentFilters> {
    return this.instruments.getInstrumentFilters();
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

  /**
   * The review step's figures (LEAP-017): cost, fee and total for the ticket
   * as typed, worked out by trade_api. Creates no order.
   */
  reviewOrder(order: OrderReviewRequest): Observable<OrderReviewResponse> {
    return this.orders.reviewOrder(order);
  }

  // ===== Strategies (design/strategy-api.yaml) =====

  strategies(): Observable<StrategyResponse[]> {
    return this.strategiesApi.getStrategies();
  }

  createStrategy(request: CreateStrategyRequest): Observable<StrategyResponse> {
    return this.strategiesApi.createStrategy(request);
  }

  /** Rewrites a strategy that is not running (disabled or stopped); a running one answers STR-409. */
  updateStrategy(strategyId: string, request: CreateStrategyRequest): Observable<StrategyResponse> {
    return this.strategiesApi.updateStrategy(strategyId, request);
  }

  enableStrategy(strategyId: string): Observable<StrategyResponse> {
    return this.strategiesApi.enableStrategy(strategyId);
  }

  disableStrategy(strategyId: string): Observable<StrategyResponse> {
    return this.strategiesApi.disableStrategy(strategyId);
  }

  strategyEvents(strategyId: string): Observable<StrategyEventResponse[]> {
    return this.strategiesApi.getStrategyEvents(strategyId);
  }

  // ===== Watchlists and price alerts (design/watchlist-api.yaml) =====

  getWatchlists(): Observable<WatchlistResponse[]> {
    return this.watchlists.getWatchlists();
  }

  getWatchlist(watchlistId: string): Observable<WatchlistResponse> {
    return this.watchlists.getWatchlist(watchlistId);
  }

  createWatchlist(request: CreateWatchlistRequest): Observable<WatchlistResponse> {
    return this.watchlists.createWatchlist(request);
  }

  updateWatchlist(watchlistId: string, request: UpdateWatchlistRequest): Observable<WatchlistResponse> {
    return this.watchlists.updateWatchlist(watchlistId, request);
  }

  deleteWatchlist(watchlistId: string): Observable<unknown> {
    return this.watchlists.deleteWatchlist(watchlistId);
  }

  getWatchlistItems(watchlistId: string): Observable<WatchlistItemResponse[]> {
    return this.watchlists.getWatchlistItems(watchlistId);
  }

  addWatchlistItem(watchlistId: string, request: AddWatchlistItemRequest): Observable<WatchlistItemResponse> {
    return this.watchlists.addWatchlistItem(watchlistId, request);
  }

  /** Adds one instrument to several watchlists at once. */
  addWatchlistItemsBulk(request: BulkAddWatchlistItemsRequest): Observable<WatchlistItemResponse[]> {
    return this.watchlists.addWatchlistItemsBulk(request);
  }

  removeWatchlistItem(watchlistId: string, itemId: string): Observable<unknown> {
    return this.watchlists.removeWatchlistItem(watchlistId, itemId);
  }

  reorderWatchlistItems(watchlistId: string, request: ReorderWatchlistItemsRequest): Observable<unknown> {
    return this.watchlists.reorderWatchlistItems(watchlistId, request);
  }

  /** Sets the item's alert and arms it (ACTIVE). */
  createPriceAlert(
    watchlistId: string,
    itemId: string,
    request: CreatePriceAlertRequest,
  ): Observable<PriceAlertResponse> {
    return this.alerts.createPriceAlert(watchlistId, itemId, request);
  }

  /** Changes the threshold (re-arms it), or both fields null cancels it. */
  updatePriceAlert(
    watchlistId: string,
    itemId: string,
    request: UpdatePriceAlertRequest,
  ): Observable<PriceAlertResponse> {
    return this.alerts.updatePriceAlert(watchlistId, itemId, request);
  }

  /** Cancels the item's alert; it stays readable as CANCELLED. */
  deletePriceAlert(watchlistId: string, itemId: string): Observable<unknown> {
    return this.alerts.deletePriceAlert(watchlistId, itemId);
  }
}
