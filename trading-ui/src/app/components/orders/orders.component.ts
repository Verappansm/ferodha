import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { OrderHistoryEntry, TradeApi } from '../../api/trade-api';
import { errorMessage } from '../../core/errors/error-message';
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

@Component({
  selector: 'app-orders',
  imports: [DatePipe, DecimalPipe, OrderStatusBadgeComponent],
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
      const history = await firstValueFrom(this.tradeApi.orderHistory(accountId));
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
