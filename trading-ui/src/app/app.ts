import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { PreferencesStore } from './core/preferences/preferences.store';
import {
  AppNotification,
  NotificationsStore,
  NotificationType,
} from './core/notifications/notifications.store';
import { Session } from './core/session/session';
import { Theme } from './core/theme/theme';
import { ThemeToggleComponent } from './components/theme-toggle/theme-toggle.component';

/** The main navigation, in the order a customer works through it. */
export const NAV_LINKS = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/portfolio', label: 'Portfolio' },
  { path: '/instruments', label: 'Markets' },
  { path: '/orders', label: 'Orders' },
  { path: '/watchlist', label: 'Watchlist' },
  { path: '/strategies', label: 'Strategies' },
  { path: '/bank', label: 'Bank' },
] as const;

const TOAST_TITLES: Record<NotificationType, string> = {
  ORDER_FILLED: 'Order filled',
  ORDER_REJECTED: 'Order rejected',
  ORDER_CANCELLED: 'Order cancelled',
  PRICE_ALERT: 'Price alert',
};

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ThemeToggleComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: {
    '(document:click)': 'closeMenu(); closeNav()',
    '(document:keydown.escape)': 'closeMenu(); closeNav()',
  },
})
export class App {
  protected readonly session = inject(Session);
  // Created at start-up so a saved light/dark choice applies on every page.
  private readonly theme = inject(Theme);
  // Created at start-up so saved preferences apply on every page, after a reload too.
  protected readonly preferences = inject(PreferencesStore);
  // Created at start-up so the bell's unread count is kept fresh while signed in.
  protected readonly notifications = inject(NotificationsStore);
  private readonly router = inject(Router);

  protected readonly links = NAV_LINKS;
  protected readonly menuOpen = signal(false);
  /** The folded main navigation on narrow screens. */
  protected readonly navOpen = signal(false);
  /** The first letter of the signed-in email, for the account button. */
  protected readonly initial = computed(() => this.session.user()?.username?.charAt(0) ?? '?');

  constructor() {
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.menuOpen.set(false);
        this.navOpen.set(false);
      });
  }

  protected toggleNav(event: Event): void {
    event.stopPropagation();
    this.menuOpen.set(false);
    this.navOpen.update((open) => !open);
  }

  protected closeNav(): void {
    this.navOpen.set(false);
  }

  protected toggleMenu(event: Event): void {
    event.stopPropagation();
    this.navOpen.set(false);
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected signOut(): void {
    this.menuOpen.set(false);
    this.session.signOut();
    void this.router.navigateByUrl('/login');
  }

  protected toastTitle(type: NotificationType): string {
    return TOAST_TITLES[type] ?? 'Notification';
  }

  protected toastTone(type: NotificationType): string {
    if (type === 'ORDER_FILLED') return 'positive';
    if (type === 'ORDER_REJECTED') return 'negative';
    if (type === 'PRICE_ALERT') return 'warning';
    return 'info';
  }

  /** An order notification opens the orders page; anything else the inbox. */
  protected toastLink(n: AppNotification): string {
    return n.orderId ? '/orders' : '/notifications';
  }

  protected openToast(n: AppNotification): void {
    void this.notifications.markRead(n.notificationId);
  }
}
