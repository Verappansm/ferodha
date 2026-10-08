import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MoneyPipe } from '../../core/format/money.pipe';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { OrderFilter, OrderHistoryEntry, OrderStatus, TradeApi } from '../../api/trade-api';
import { errorMessage } from '../../core/errors/error-message';
import { rejectionLabel, rejectionText } from '../../core/format/rejection-reason';
import { Session } from '../../core/session/session';
import {
  OrderStatusBadgeComponent,
  WORKING_STATUSES,
} from '../order-status-badge/order-status-badge.component';

/**
 * While any order is at NEW the blotter re-reads order history on this
 * interval, at most MAX_POLLS times, then waits for the user to press Refresh.
 * The contract says where to poll (GET /accounts/{id}/orders), not how often.
 */
export const POLL_INTERVAL_MS = 3000;
export const MAX_POLLS = 10;

/** ORD-409 on a cancel: the executor finished the order first. */
export const CANCEL_TOO_LATE =
  'This order finished before it could be cancelled, so nothing was changed. Its final status is shown below.';

/** The statuses the history can be filtered by (the contract's four). */
export const STATUS_FILTERS: OrderStatus[] = [
  OrderStatus.NEW,
  OrderStatus.FILLED,
  OrderStatus.REJECTED,
  OrderStatus.CANCELLED,
];

@Component({
  selector: 'app-orders',
  imports: [DatePipe, MoneyPipe, FormsModule, RouterLink, OrderStatusBadgeComponent],
  templateUrl: './orders.component.html',
  styleUrls: ['./orders.component.css'],
})
export class OrdersComponent {
  private readonly session = inject(Session);
  private readonly tradeApi = inject(TradeApi);

  readonly orders = signal<OrderHistoryEntry[]>([]);
  readonly isLoading = signal(false);
  readonly hasLoaded = signal(false);
  readonly error = signal('');
  readonly isPolling = signal(false);
  private readonly pollsLeft = signal(MAX_POLLS);

  readonly statusFilters = STATUS_FILTERS;
  readonly rejectionLabel = rejectionLabel;
  readonly rejectionText = rejectionText;
  /** The filter fields as typed; applied to the history only on Apply. */
  statusFilter: OrderStatus | '' = '';
  fromDate = '';
  toDate = '';
  private readonly appliedFilter = signal<OrderFilter | null>(null);
  readonly isFiltered = computed(() => this.appliedFilter() !== null);

  /** The order whose cancel is waiting for a yes, and the one being cancelled. */
  readonly confirmingId = signal<string | null>(null);
  readonly cancellingId = signal<string | null>(null);
  readonly cancelOutcome = signal<{ ok: boolean; text: string } | null>(null);

  /** Orders the executor has not finished with, listed apart with a cancel control. */
  readonly openOrders = computed(() => this.orders().filter((o) => WORKING_STATUSES.has(o.status)));
  readonly finishedOrders = computed(() =>
    this.orders().filter((o) => !WORKING_STATUSES.has(o.status)),
  );

  /** NEW, or PARTIALLY_FILLED under market-sim: the executor has not finished with it. */
  readonly hasWorking = computed(() => this.orders().some((o) => WORKING_STATUSES.has(o.status)));
  /** Something is still at NEW but the re-read budget is spent. */
  readonly isStalled = computed(
    () => this.hasWorking() && !this.isPolling() && this.pollsLeft() === 0,
  );

  private timer: ReturnType<typeof setTimeout> | undefined;
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.stopPolling();
    });
    void this.load();
  }

  /** Re-reads now and gives the re-read a fresh budget. Never re-posts an order. */
  refresh(): void {
    this.stopPolling();
    this.pollsLeft.set(MAX_POLLS);
    void this.load();
  }

  /** Applies the status and date filters to the history (the route's own query parameters). */
  applyFilters(): void {
    if (this.fromDate && this.toDate && this.fromDate > this.toDate) {
      this.error.set('The "from" date must be on or before the "to" date.');
      return;
    }
    const filter: OrderFilter = {};
    if (this.statusFilter) filter.status = this.statusFilter;
    // Whole local days: from the start of "from" to the end of "to".
    if (this.fromDate) filter.from = new Date(`${this.fromDate}T00:00:00`).toISOString();
    if (this.toDate) filter.to = new Date(`${this.toDate}T23:59:59.999`).toISOString();
    this.error.set('');
    this.appliedFilter.set(Object.keys(filter).length > 0 ? filter : null);
    this.refresh();
  }

  clearFilters(): void {
    this.statusFilter = '';
    this.fromDate = '';
    this.toDate = '';
    this.applyFilters();
  }

  askCancel(orderId: string): void {
    this.cancelOutcome.set(null);
    this.confirmingId.set(orderId);
  }

  keepOrder(): void {
    this.confirmingId.set(null);
  }

  /**
   * Cancels once, after the confirmation, and shows the outcome. Either way
   * the history is re-read, so the order shows the status it really ended at.
   */
  async confirmCancel(order: OrderHistoryEntry): Promise<void> {
    if (this.cancellingId()) return;
    this.cancellingId.set(order.orderId);
    try {
      await firstValueFrom(this.tradeApi.cancelOrder(order.orderId));
      this.cancelOutcome.set({ ok: true, text: `Order ${order.orderId} is cancelled.` });
    } catch (error) {
      this.cancelOutcome.set({
        ok: false,
        text: errorMessage(error, { 'ORD-409': CANCEL_TOO_LATE }),
      });
    } finally {
      this.cancellingId.set(null);
      this.confirmingId.set(null);
      if (!this.destroyed) this.refresh();
    }
  }

  /** What the order is worth: the fill price once filled, the limit price until then. */
  value(order: OrderHistoryEntry): number {
    return order.quantity * (order.executedPrice ?? order.price);
  }

  private async load(): Promise<void> {
    const accountId = this.session.accountId();
    if (!accountId) {
      this.error.set('Sign in to see your orders.');
      return;
    }
    this.isLoading.set(true);
    try {
      const filter = this.appliedFilter();
      const history = await firstValueFrom(
        filter
          ? this.tradeApi.orderHistory(accountId, filter)
          : this.tradeApi.orderHistory(accountId),
      );
      if (this.destroyed) return;
      this.orders.set(newestFirst(history));
      this.error.set('');
      this.hasLoaded.set(true);
      this.scheduleReRead();
    } catch (error) {
      if (this.destroyed) return;
      // A failed read stops the re-read; Refresh tries again.
      this.error.set(errorMessage(error));
    } finally {
      this.isLoading.set(false);
    }
  }

  private scheduleReRead(): void {
    if (!this.hasWorking() || this.pollsLeft() === 0) {
      this.isPolling.set(false);
      return;
    }
    this.isPolling.set(true);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.pollsLeft.update((n) => n - 1);
      void this.load();
    }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.isPolling.set(false);
  }
}

/** The service already answers newest first; sorting again keeps the blotter right regardless. */
function newestFirst(orders: OrderHistoryEntry[]): OrderHistoryEntry[] {
  return [...orders].sort((a, b) => Date.parse(b.createdOn) - Date.parse(a.createdOn));
}
