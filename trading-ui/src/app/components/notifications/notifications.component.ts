import { DatePipe } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import {
  AppNotification,
  NotificationsStore,
  NotificationType,
} from '../../core/notifications/notifications.store';

const LABELS: Record<NotificationType, string> = {
  ORDER_FILLED: 'Order filled',
  ORDER_REJECTED: 'Order rejected',
  ORDER_CANCELLED: 'Order cancelled',
  PRICE_ALERT: 'Price alert',
};

/** What happened to the customer's orders and watchlist alerts, newest first (LEAP-008). */
@Component({
  selector: 'app-notifications',
  imports: [DatePipe],
  styles: `
    .page {
      max-width: 48rem;
      margin: 2rem auto;
      padding: 0 1rem;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }
    h1 {
      margin: 0;
      color: var(--ink-900);
    }
    ul {
      list-style: none;
      margin: 1rem 0 0;
      padding: 0;
    }
    li {
      display: flex;
      gap: 0.75rem;
      justify-content: space-between;
      align-items: flex-start;
      background: var(--surface);
      border: 1px solid var(--ink-200);
      border-radius: var(--radius);
      padding: 0.75rem 1rem;
      margin-bottom: 0.5rem;
    }
    li.unread {
      border-left: 4px solid var(--brand-500);
    }
    .kind {
      font-weight: 600;
      color: var(--ink-900);
    }
    .new {
      margin-left: 0.5rem;
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--brand-700);
      background: var(--brand-100);
      border-radius: 999px;
      padding: 0.1rem 0.5rem;
    }
    .msg {
      margin: 0.25rem 0 0;
      color: var(--ink-700);
    }
    .meta {
      margin: 0.25rem 0 0;
      font-size: 0.8125rem;
      color: var(--ink-500);
    }
    .empty {
      margin-top: 2rem;
      text-align: center;
      color: var(--ink-500);
    }
  `,
  template: `
    <div class="page" data-testid="notifications">
      <header>
        <h1>Notifications</h1>
        <button
          type="button"
          class="btn btn-secondary"
          data-testid="mark-all-read"
          [disabled]="store.unread() === 0"
          (click)="store.markAllRead()"
        >
          Mark all as read
        </button>
      </header>

      @if (store.error()) {
        <p class="field-error" role="alert" data-testid="notifications-error">
          {{ store.error() }}
        </p>
      }

      @if (store.items().length === 0 && !store.loading()) {
        <p class="empty" data-testid="notifications-empty">
          Nothing yet. Fills, rejections, cancellations and price alerts will show up here.
        </p>
      } @else {
        <ul aria-label="Your notifications">
          @for (n of store.items(); track n.notificationId) {
            <li [class.unread]="!n.readAt" [attr.data-testid]="'notification-' + n.notificationId">
              <div>
                <span class="kind">{{ label(n) }}</span>
                @if (!n.readAt) {
                  <span class="new">New</span>
                }
                <p class="msg">{{ n.message }}</p>
                <p class="meta">
                  {{ n.createdAt | date: 'medium' }}
                  @if (n.resolvedChannel === 'EMAIL') {
                    · also emailed
                  }
                </p>
              </div>
              @if (!n.readAt) {
                <button
                  type="button"
                  class="btn btn-secondary"
                  [attr.data-testid]="'read-' + n.notificationId"
                  (click)="store.markRead(n.notificationId)"
                >
                  Mark read
                </button>
              }
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class NotificationsComponent implements OnInit {
  protected readonly store = inject(NotificationsStore);

  ngOnInit(): void {
    void this.store.refresh();
  }

  protected label(n: AppNotification): string {
    return LABELS[n.eventType] ?? 'Notification';
  }
}
