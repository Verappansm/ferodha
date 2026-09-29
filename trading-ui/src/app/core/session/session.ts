import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthApi, UserResponse } from '../../api/auth-api';

/** What a signed-in session holds, and what survives a page reload. */
interface StoredSession {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds after which the access token is no longer accepted. */
  expiresAt: number;
  user: UserResponse;
}

export const SESSION_STORAGE_KEY = 'trading-ui.session';

/**
 * The signed-in session. Kept in sessionStorage so a reload keeps the user
 * signed in while closing the tab ends the session; nothing goes to
 * localStorage or a cookie. The access token is read by the auth-token
 * interceptor and by nothing else.
 */
@Injectable({ providedIn: 'root' })
export class Session {
  private readonly authApi = inject(AuthApi);
  private readonly state = signal<StoredSession | null>(restore());
  /** A token just issued by login, held only while /auth/me is asked about it. */
  private readonly pendingToken = signal<string | null>(null);

  readonly accessToken = computed(() => this.state()?.accessToken ?? this.pendingToken());
  readonly user = computed(() => this.state()?.user ?? null);
  /** The account the token says this session may trade. */
  readonly accountId = computed(() => this.state()?.user.accountId ?? null);
  readonly isSignedIn = computed(() => this.state() !== null);

  /**
   * Logs in, then asks /auth/me who the token belongs to, as the contract
   * says the UI should. Rejects with the HTTP error if either call fails, and
   * leaves nothing behind in that case.
   */
  async signIn(username: string, password: string): Promise<void> {
    const tokens = await firstValueFrom(this.authApi.login(username, password));
    this.pendingToken.set(tokens.accessToken);
    try {
      const user = await firstValueFrom(this.authApi.currentUser());
      this.save({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: Date.now() + tokens.expiresIn * 1000,
        user,
      });
    } catch (error) {
      this.signOut();
      throw error;
    } finally {
      this.pendingToken.set(null);
    }
  }

  /** Forgets the tokens and the user, in memory and in sessionStorage. */
  signOut(): void {
    this.state.set(null);
    this.pendingToken.set(null);
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Storage unavailable (private mode, blocked): memory is already clear.
    }
  }

  private save(session: StoredSession): void {
    this.state.set(session);
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // Storage unavailable: the session lasts until the page is reloaded.
    }
  }
}

/** The stored session, unless it is missing, unreadable or expired. */
function restore(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as StoredSession;
    if (!session.accessToken || !session.user || session.expiresAt <= Date.now()) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}
