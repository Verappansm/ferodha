import { DOCUMENT } from '@angular/common';
import { DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NotificationsService } from '../../api/generated/notifications/api/notifications.service';
import { NotificationResponse } from '../../api/generated/notifications/model/notification-response';
import { NotificationEventType } from '../../api/generated/notifications/model/notification-event-type';
import { errorMessage } from '../errors/error-message';
import { Session } from '../session/session';

export type NotificationType = NotificationEventType;

/** A notification as contracts/notifications-api.yaml describes it. */
export type AppNotification = NotificationResponse;

/** How often the bell's count is refreshed while someone is signed in. */
export const POLL_MS = 30_000;

/** How long a toast for a new notification stays on screen. */
export const TOAST_MS = 6_000;

/**
 * The signed-in customer's notifications (the bell and the notifications page). The server
 * decides who hears about what from their Settings; this only reads what was stored for them
 * and marks it read. While signed in it re-reads every 30 seconds, quietly: a failed refresh
 * keeps what is already shown. The poll pauses while the tab is hidden, so an idle tab is not
 * a load test, and catches up as soon as it is shown again. Anything new since the last read
 * is also raised as a toast.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsStore {
  private readonly api = inject(NotificationsService);
  private readonly session = inject(Session);

  readonly items = signal<AppNotification[]>([]);
  readonly unread = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');
  /** Notifications that arrived since the last read, shown briefly as toasts. */
  readonly toasts = signal<AppNotification[]>([]);

  private readonly document = inject(DOCUMENT);
  private timer: ReturnType<typeof setInterval> | null = null;
  /** The ids already on screen; null until the first read, which raises no toasts. */
  private seen: Set<string> | null = null;

  constructor() {
    effect(() => {
      if (this.session.isSignedIn()) {
        this.start();
      } else {
        this.stop();
      }
    });
    const onVisibility = () => {
      if (!this.session.isSignedIn()) return;
      if (this.document.hidden) {
        this.pause();
      } else {
        this.start();
      }
    };
    this.document.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('visibilitychange', onVisibility);
      this.pause();
    });
  }

  dismissToast(id: string): void {
    this.toasts.update((all) => all.filter((n) => n.notificationId !== id));
  }

  /** Loads the latest notifications. A manual call shows an error; the poll does not. */
  async refresh(showErrors = true): Promise<void> {
    this.loading.set(true);
    try {
      const response = await firstValueFrom(this.api.listNotifications(50, 0));
      this.raiseToasts(response.notifications);
      this.items.set(response.notifications);
      this.unread.set(response.unread);
      this.error.set('');
    } catch (error) {
      if (showErrors) this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  async markRead(id: string): Promise<void> {
    const target = this.items().find((n) => n.notificationId === id);
    if (!target || target.readAt) return;
    try {
      await firstValueFrom(this.api.markNotificationRead(id));
      const now = new Date().toISOString();
      this.items.update((all) =>
        all.map((n) => (n.notificationId === id ? { ...n, readAt: now } : n)),
      );
      this.unread.update((count) => Math.max(0, count - 1));
      this.dismissToast(id);
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }

  async markAllRead(): Promise<void> {
    try {
      await firstValueFrom(this.api.markAllNotificationsRead());
      const now = new Date().toISOString();
      this.items.update((all) => all.map((n) => (n.readAt ? n : { ...n, readAt: now })));
      this.unread.set(0);
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }

  /** Unread notifications not seen before become toasts; the first read only remembers. */
  private raiseToasts(latest: AppNotification[]): void {
    const seen = this.seen;
    this.seen = new Set(latest.map((n) => n.notificationId));
    if (seen === null) return;
    const fresh = latest.filter((n) => !n.readAt && !seen.has(n.notificationId)).slice(0, 3);
    if (fresh.length === 0) return;
    this.toasts.update((all) => [...fresh, ...all].slice(0, 3));
    for (const n of fresh) {
      setTimeout(() => this.dismissToast(n.notificationId), TOAST_MS);
    }
  }

  private start(): void {
    if (this.timer || this.document.hidden) return;
    void this.refresh(false);
    this.timer = setInterval(() => void this.refresh(false), POLL_MS);
  }

  private pause(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private stop(): void {
    this.pause();
    this.seen = null;
    this.items.set([]);
    this.unread.set(0);
    this.toasts.set([]);
  }
}
