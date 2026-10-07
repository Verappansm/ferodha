import { HttpClient } from '@angular/common/http';
import { effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { errorMessage } from '../errors/error-message';
import { Session } from '../session/session';

export type NotificationType =
  'ORDER_FILLED' | 'ORDER_REJECTED' | 'ORDER_CANCELLED' | 'PRICE_ALERT';

export interface AppNotification {
  notificationId: string;
  eventType: NotificationType;
  orderId: string | null;
  symbol: string | null;
  resolvedChannel: 'IN_APP' | 'EMAIL';
  message: string;
  status: string;
  createdAt: string;
  /** When the customer read it; null while unread. */
  readAt: string | null;
}

interface NotificationsResponse {
  notifications: AppNotification[];
  total: number;
  unread: number;
}

/** How often the bell's count is refreshed while someone is signed in. */
export const POLL_MS = 30_000;

const URL = `${environment.tradeApiUrl}/api/v1/notifications`;

/**
 * The signed-in customer's notifications (the bell and the notifications page). The server
 * decides who hears about what from their Settings; this only reads what was stored for them
 * and marks it read. While signed in it re-reads every 30 seconds, quietly: a failed refresh
 * keeps what is already shown.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsStore {
  private readonly http = inject(HttpClient);
  private readonly session = inject(Session);

  readonly items = signal<AppNotification[]>([]);
  readonly unread = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');

  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    effect(() => {
      if (this.session.isSignedIn()) {
        this.start();
      } else {
        this.stop();
      }
    });
  }

  /** Loads the latest notifications. A manual call shows an error; the poll does not. */
  async refresh(showErrors = true): Promise<void> {
    this.loading.set(true);
    try {
      const response = await firstValueFrom(
        this.http.get<NotificationsResponse>(URL, { params: { limit: 50 } }),
      );
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
      await firstValueFrom(this.http.patch<void>(`${URL}/${id}/read`, null));
      const now = new Date().toISOString();
      this.items.update((all) =>
        all.map((n) => (n.notificationId === id ? { ...n, readAt: now } : n)),
      );
      this.unread.update((count) => Math.max(0, count - 1));
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }

  async markAllRead(): Promise<void> {
    try {
      await firstValueFrom(this.http.post<void>(`${URL}/read-all`, null));
      const now = new Date().toISOString();
      this.items.update((all) => all.map((n) => (n.readAt ? n : { ...n, readAt: now })));
      this.unread.set(0);
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }

  private start(): void {
    if (this.timer) return;
    void this.refresh(false);
    this.timer = setInterval(() => void this.refresh(false), POLL_MS);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.items.set([]);
    this.unread.set(0);
  }
}
