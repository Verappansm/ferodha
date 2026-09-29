import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService as GeneratedAuthService } from './generated/auth/api/auth.service';
import { ProfileService } from './generated/auth/api/profile.service';
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

  login(username: string, password: string): Observable<TokenResponse> {
    return this.auth.login({ username, password });
  }

  refresh(refreshToken: string): Observable<TokenResponse> {
    return this.auth.refresh({ refreshToken });
  }

  currentUser(): Observable<UserResponse> {
    return this.profile.getCurrentUser();
  }
}
