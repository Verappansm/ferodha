import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService as GeneratedAuthService } from './generated/auth/api/auth.service';
import { ProfileService } from './generated/auth/api/profile.service';
import { RegisterRequest } from './generated/auth/model/register-request';
import { passwordDigest } from '../core/auth/password-digest';
import { TokenResponse } from './generated/auth/model/token-response';
import { UserResponse } from './generated/auth/model/user-response';

export type { TokenResponse, UserResponse };

/**
 * The Auth service as the rest of the application uses it, over the client
 * generated from design/auth-api.yaml. Hides the generated overloads (observe,
 * reportProgress, options) behind one plain method per call.
 */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly auth = inject(GeneratedAuthService);
  private readonly profile = inject(ProfileService);

  /** The password never leaves the browser: only its digest does (B23). */
  login(username: string, password: string): Observable<TokenResponse> {
    return this.auth.login({ username, password: passwordDigest(username, password) });
  }

  /**
   * Registers a user, which also files their account-opening request.
   *
   * The one place the UI departs from the generated RegisterRequest
   * (story_docs/contract-breach.md, B01, B02, B08): our auth service takes an
   * email as the username and an optional display name, and refuses the
   * contract's required `accountId`, because a user is registered before any
   * account is opened for them. The cast is confined to this method.
   */
  register(name: string, email: string, password: string): Observable<UserResponse> {
    const body = {
      name,
      username: email,
      password: passwordDigest(email, password),
    } as unknown as RegisterRequest;
    return this.auth.register(body);
  }

  /**
   * Changes the password, proving the current one (LEAP-010); this is also
   * how a forced reset is completed. Both passwords leave as digests (B23).
   */
  changePassword(username: string, currentPassword: string, newPassword: string): Observable<void> {
    return this.auth.changePassword({
      username,
      currentPassword: passwordDigest(username, currentPassword),
      newPassword: passwordDigest(username, newPassword),
    }) as Observable<void>;
  }

  /** Enters the six-digit code mailed at registration: proves the email is theirs. */
  verifyEmail(username: string, code: string): Observable<void> {
    return this.auth.verifyEmail({ username, code }) as Observable<void>;
  }

  /** Mails a new code (the server allows one a minute and always answers 204). */
  resendCode(username: string): Observable<void> {
    return this.auth.resendVerificationCode({ username }) as Observable<void>;
  }

  refresh(refreshToken: string): Observable<TokenResponse> {
    return this.auth.refresh({ refreshToken });
  }

  currentUser(): Observable<UserResponse> {
    return this.profile.getCurrentUser();
  }
}
