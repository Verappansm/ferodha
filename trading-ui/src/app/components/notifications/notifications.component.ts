import { DatePipe } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
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

const TONES: Record<NotificationType, string> = {
  ORDER_FILLED: 'positive',
  ORDER_REJECTED: 'negative',
  ORDER_CANCELLED: 'neutral',
  PRICE_ALERT: 'warning',
};

/** What happened to the customer's orders and watchlist alerts, newest first (LEAP-008). */
@Component({
  selector: 'app-notifications',
  imports: [DatePipe, RouterLink],
  styles: `
    .list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      position: relative;
      display: flex;
      gap: 14px;
      align-items: flex-start;
      padding: 14px 18px;
      border-bottom: 1px solid var(--ink-200);
      transition: background-color 0.15s ease;
    }
    li:last-child {
      border-bottom: 0;
    }
    li.unread {
      background: color-mix(in srgb, var(--brand-100) 45%, transparent);
    }
    li.unread::before {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: 3px;
      content: '';
      background: var(--brand-500);
    }
    .icon {
      display: grid;
      flex: none;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 50%;
    }
    .icon svg {
      width: 17px;
      height: 17px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .tone-positive {
      color: var(--positive);
      background: var(--positive-bg);
    }
    .tone-negative {
      color: var(--negative);
      background: var(--negative-bg);
    }
    .tone-warning {
      color: var(--warning);
      background: var(--warning-bg);
    }
    .tone-neutral {
      color: var(--ink-500);
      background: var(--ink-100);
    }
    .body {
      flex: 1;
      min-width: 0;
    }
    .kind {
      font-weight: 600;
      color: var(--ink-900);
    }
    .new {
      margin-left: 8px;
      padding: 0 7px;
      font-size: 11px;
      font-weight: 700;
      line-height: 18px;
      color: var(--brand-700);
      background: var(--brand-100);
      border-radius: 999px;
    }
    .msg {
      margin: 3px 0 0;
      color: var(--ink-700);
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
      margin: 6px 0 0;
      font-size: 12.5px;
      color: var(--ink-500);
    }
    .meta a {
      font-weight: 600;
      text-decoration: none;
    }
    .meta a:hover {
      text-decoration: underline;
    }
  `,
  template: `
    <div class="page page-narrow" data-testid="notifications">
      <header class="page-header">
        <div>
          <h1>Notifications</h1>
          <p>Fills, rejections, cancellations and price alerts, newest first.</p>
        </div>
        <div class="page-actions">
          <button
            type="button"
            class="btn btn-secondary"
            data-testid="mark-all-read"
            [disabled]="store.unread() === 0"
            (click)="store.markAllRead()"
          >
            Mark all as read
          </button>
        </div>
      </header>

      @if (store.error()) {
        <p class="notice notice-error" role="alert" data-testid="notifications-error">
          {{ store.error() }}
        </p>
      }

      <section class="card" aria-label="Your notifications">
        @if (store.items().length === 0 && !store.loading()) {
          <p class="state" data-testid="notifications-empty">
            <strong>Nothing yet</strong>
            Fills, rejections, cancellations and price alerts will show up here.
          </p>
        } @else if (store.items().length === 0) {
          <div class="card-body" aria-hidden="true">
            <div class="skeleton"></div>
            <div class="skeleton"></div>
          </div>
        } @else {
          <ul class="list">
            @for (n of store.items(); track n.notificationId) {
              <li [class.unread]="!n.readAt" [attr.data-testid]="'notification-' + n.notificationId">
                <span [class]="'icon tone-' + tone(n)" aria-hidden="true">
                  @switch (n.eventType) {
                    @case ('ORDER_FILLED') {
                      <svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10" /></svg>
                    }
                    @case ('ORDER_REJECTED') {
                      <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    }
                    @case ('PRICE_ALERT') {
                      <svg viewBox="0 0 24 24">
                        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                      </svg>
                    }
                    @default {
                      <svg viewBox="0 0 24 24"><path d="M5 12h14" /></svg>
                    }
                  }
                </span>
                <div class="body">
                  <span class="kind">{{ label(n) }}</span>
                  @if (!n.readAt) {
                    <span class="new">New</span>
                  }
                  <p class="msg">{{ n.message }}</p>
                  <p class="meta">
                    <span>{{ n.createdAt | date: 'd MMM y, HH:mm' }}</span>
                    @if (n.resolvedChannel === 'EMAIL') {
                      <span>Also emailed</span>
                    }
                    @if (n.orderId) {
                      <a
                        routerLink="/orders"
                        [attr.data-testid]="'order-link-' + n.notificationId"
                        (click)="store.markRead(n.notificationId)"
                        >View order {{ n.orderId }}</a
                      >
                    } @else if (n.symbol) {
                      <a [routerLink]="['/instruments', n.symbol]">View {{ n.symbol }}</a>
                    }
                  </p>
                </div>
                @if (!n.readAt) {
                  <button
                    type="button"
                    class="btn btn-ghost btn-sm"
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
      </section>
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

  protected tone(n: AppNotification): string {
    return TONES[n.eventType] ?? 'neutral';
  }
}
