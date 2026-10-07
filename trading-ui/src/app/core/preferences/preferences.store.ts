import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  PreferencesApi,
  PreferencesResponse,
  PreferencesUpdateRequest,
  StartPage,
} from '../../api/preferences-api';
import { Session } from '../session/session';
import { Theme } from '../theme/theme';

/** Preferences without the account they belong to. */
export type PreferenceValues = Omit<PreferencesResponse, 'accountId' | 'defaultAccountId'>;

/**
 * What applies until the server answers, or when it cannot. Matches
 * PreferenceDefaults in trade_api, so a customer sees the same app either way.
 */
export const DEFAULT_PREFERENCES: PreferenceValues = {
  notificationChannel: 'IN_APP',
  contactDetail: null,
  notifyOn: { orderFilled: true, orderRejected: true, orderCancelled: true, priceAlerts: true },
  theme: 'LIGHT',
  numberFormat: 'INTERNATIONAL',
  compactTables: false,
  hideBalances: false,
  startPage: 'DASHBOARD',
  customised: [],
};

const START_PATHS: Record<StartPage, string> = {
  DASHBOARD: '/dashboard',
  PORTFOLIO: '/portfolio',
  WATCHLIST: '/watchlist',
  ORDERS: '/orders',
};

/**
 * The signed-in customer's preferences (LEAP-010), loaded once per sign-in
 * and applied across the app: theme, number format, compact tables, hidden
 * balances and the page opened after sign-in. If they cannot be loaded the
 * app keeps working on the defaults.
 */
@Injectable({ providedIn: 'root' })
export class PreferencesStore {
  private readonly api = inject(PreferencesApi);
  private readonly session = inject(Session);
  private readonly theme = inject(Theme);
  private readonly root = inject(DOCUMENT).documentElement;

  /** As the server last returned them; null before loading or after sign-out. */
  readonly saved = signal<PreferencesResponse | null>(null);
  /** False when the last load failed, so the defaults are standing in. */
  readonly available = signal(true);
  /** Balances hidden right now: starts from the preference, the eye icon flips it. */
  readonly masked = signal(false);

  readonly values = computed<PreferenceValues>(() => this.saved() ?? DEFAULT_PREFERENCES);
  readonly numberFormat = computed(() => this.values().numberFormat);
  readonly startPath = computed(() => START_PATHS[this.values().startPage]);

  private loadedFor: number | null = null;
  private loading: Promise<void> | null = null;

  constructor() {
    // A page reload restores the session without signing in again; load then too.
    effect(() => {
      const accountId = this.session.accountId();
      if (accountId == null) this.clear();
      else if (accountId !== this.loadedFor) void this.load();
    });
    effect(() => {
      this.root.classList.toggle(
        'compact',
        this.session.isSignedIn() && this.values().compactTables,
      );
    });
  }

  /** Loads the preferences of the signed-in account and applies them. Never rejects. */
  load(): Promise<void> {
    const accountId = this.session.accountId();
    if (accountId == null) return Promise.resolve();
    if (accountId === this.loadedFor && this.loading) return this.loading;
    this.loadedFor = accountId;
    this.loading = firstValueFrom(this.api.get(accountId))
      .then((prefs) => this.apply(prefs))
      .catch(() => this.available.set(false));
    return this.loading;
  }

  /** Saves the settings given; the others keep their values. Rejects if the save fails. */
  async save(changes: PreferencesUpdateRequest): Promise<void> {
    const accountId = this.requireAccount();
    this.apply(await firstValueFrom(this.api.update(accountId, changes)));
  }

  /** Forgets every saved setting, so the defaults apply again. */
  async reset(): Promise<void> {
    const accountId = this.requireAccount();
    this.apply(await firstValueFrom(this.api.reset(accountId)));
  }

  /** The navbar toggle: flips light/dark now and remembers it for this customer. */
  toggleTheme(): void {
    this.theme.toggle();
    if (this.session.isSignedIn()) {
      void this.save({ theme: this.theme.isDark() ? 'DARK' : 'LIGHT' }).catch(() => undefined);
    }
  }

  toggleMasked(): void {
    this.masked.update((m) => !m);
  }

  private apply(prefs: PreferencesResponse): void {
    this.saved.set(prefs);
    this.available.set(true);
    this.masked.set(prefs.hideBalances);
    this.theme.choice.set(prefs.theme === 'DARK' ? 'dark' : 'light');
  }

  private clear(): void {
    this.loadedFor = null;
    this.loading = null;
    this.saved.set(null);
    this.available.set(true);
    this.masked.set(false);
  }

  private requireAccount(): number {
    const accountId = this.session.accountId();
    if (accountId == null) throw new Error('Not signed in');
    return accountId;
  }
}
