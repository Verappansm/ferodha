import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApi, AdminProfile } from '../../api/admin-api';

interface StoredAdminSession {
  accessToken: string;
  /** Epoch milliseconds after which the token is no longer accepted. */
  expiresAt: number;
  profile: AdminProfile;
}

export const ADMIN_SESSION_KEY = 'admin-console.session';

/**
 * The operator's session. Kept in sessionStorage under a key of its own, on
 * the console's own origin, so it never mixes with a customer session. There
 * is no refresh token: when the 15 minutes are up the operator signs in again.
 */
@Injectable({ providedIn: 'root' })
export class AdminSession {
  private readonly api = inject(AdminApi);
  private readonly state = signal<StoredAdminSession | null>(restore());
  /** A token just issued by sign-in, held only while /admin/me is asked about it. */
  private readonly pendingToken = signal<string | null>(null);

  readonly accessToken = computed(() => this.state()?.accessToken ?? this.pendingToken());
  readonly profile = computed(() => this.state()?.profile ?? null);
  readonly isSignedIn = computed(() => this.state() !== null);

  async signIn(email: string, password: string): Promise<void> {
    const tokens = await firstValueFrom(this.api.login(email, password));
    this.pendingToken.set(tokens.accessToken);
    try {
      const profile = await firstValueFrom(this.api.profile());
      this.save({
        accessToken: tokens.accessToken,
        expiresAt: Date.now() + tokens.expiresIn * 1000,
        profile,
      });
    } catch (error) {
      this.signOut();
      throw error;
    } finally {
      this.pendingToken.set(null);
    }
  }

  signOut(): void {
    this.state.set(null);
    this.pendingToken.set(null);
    try {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
    } catch {
      // Storage unavailable: memory is already clear.
    }
  }

  private save(session: StoredAdminSession): void {
    this.state.set(session);
    try {
      sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
    } catch {
      // Storage unavailable: the session lasts until the page is reloaded.
    }
  }
}

function restore(): StoredAdminSession | null {
  try {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as StoredAdminSession;
    if (!session.accessToken || !session.profile || session.expiresAt <= Date.now()) {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}
