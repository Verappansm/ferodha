import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideApiClients } from '../../api/provide-api-clients';
import { authTokenInterceptor } from '../http/auth-token.interceptor';
import { TOKEN_ALLOW_LIST, tokenAllowList } from '../http/token-allow-list';
import { Session, SESSION_STORAGE_KEY } from './session';

const URLS = { authApiUrl: 'http://auth.test', tradeApiUrl: 'http://trade.test' };
const TOKENS = {
  accessToken: 'access',
  refreshToken: 'refresh',
  tokenType: 'Bearer',
  expiresIn: 900,
};
const USER = { id: 'u1', username: 'e2e.trader@example.com', accountId: 3, roles: ['CUSTOMER'] };

function setup(): { session: Session; backend: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authTokenInterceptor])),
      provideHttpClientTesting(),
      provideApiClients(URLS),
      { provide: TOKEN_ALLOW_LIST, useValue: tokenAllowList(URLS) },
    ],
  });
  return { session: TestBed.inject(Session), backend: TestBed.inject(HttpTestingController) };
}

describe('Session', () => {
  beforeEach(() => sessionStorage.clear());

  it('signs in, learns the account from /auth/me and stores the session', async () => {
    const { session, backend } = setup();

    const signingIn = session.signIn('e2e.trader@example.com', 'seed-password-change-me');
    backend.expectOne(`${URLS.authApiUrl}/auth/login`).flush(TOKENS);
    await Promise.resolve();
    const me = backend.expectOne(`${URLS.authApiUrl}/auth/me`);
    // The fresh token goes to /auth/me through the interceptor.
    expect(me.request.headers.get('Authorization')).toBe('Bearer access');
    me.flush(USER);
    await signingIn;

    expect(session.isSignedIn()).toBe(true);
    expect(session.accessToken()).toBe('access');
    expect(session.accountId()).toBe(3);
    expect(JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY)!).accessToken).toBe('access');
    backend.verify();
  });

  it('signing out clears the session', async () => {
    const { session, backend } = setup();
    const signingIn = session.signIn('e2e.trader@example.com', 'pw');
    backend.expectOne(`${URLS.authApiUrl}/auth/login`).flush(TOKENS);
    await Promise.resolve();
    backend.expectOne(`${URLS.authApiUrl}/auth/me`).flush(USER);
    await signingIn;

    session.signOut();

    expect(session.isSignedIn()).toBe(false);
    expect(session.accessToken()).toBeNull();
    expect(session.user()).toBeNull();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('keeps nothing when the login is refused', async () => {
    const { session, backend } = setup();

    const signingIn = session.signIn('e2e.trader@example.com', 'wrong');
    backend
      .expectOne(`${URLS.authApiUrl}/auth/login`)
      .flush(
        { errorCode: 'AUTH-401', message: 'Unauthorised' },
        { status: 401, statusText: 'Unauthorized' },
      );

    await expect(signingIn).rejects.toBeTruthy();
    expect(session.isSignedIn()).toBe(false);
    expect(session.accessToken()).toBeNull();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('restores an unexpired session after a reload and drops an expired one', () => {
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ ...TOKENS, expiresAt: Date.now() + 60_000, user: USER }),
    );
    expect(setup().session.accountId()).toBe(3);

    TestBed.resetTestingModule();
    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ ...TOKENS, expiresAt: Date.now() - 1, user: USER }),
    );
    expect(setup().session.isSignedIn()).toBe(false);
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });
});
