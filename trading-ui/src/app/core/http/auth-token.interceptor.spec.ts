import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal, WritableSignal } from '@angular/core';
import { Router } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { Session } from '../session/session';
import { authTokenInterceptor } from './auth-token.interceptor';
import { mayCarryToken, TOKEN_ALLOW_LIST, tokenAllowList } from './token-allow-list';

const TRADE = 'http://localhost:8081';
const AUTH = 'http://localhost:3000';
const TOKEN = 'header.payload.signature';

describe('authTokenInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let accessToken: WritableSignal<string | null>;
  let expiring: boolean;
  let refresh: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    accessToken = signal<string | null>(TOKEN);
    expiring = false;
    refresh = vi.fn();
    navigate = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authTokenInterceptor])),
        provideHttpClientTesting(),
        {
          provide: Session,
          useValue: {
            accessToken,
            isSignedIn: () => accessToken() !== null,
            accessTokenExpiring: () => expiring,
            refresh,
          },
        },
        { provide: Router, useValue: { url: '/orders', navigate } },
        {
          provide: TOKEN_ALLOW_LIST,
          useValue: tokenAllowList({ authApiUrl: AUTH, tradeApiUrl: TRADE }),
        },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  /** The Authorization header the request left with, or null. */
  function authorizationSentTo(url: string, method: 'GET' | 'POST' = 'GET'): string | null {
    (method === 'GET' ? http.get(url) : http.post(url, {})).subscribe();
    const request = backend.expectOne(url);
    request.flush({});
    return request.request.headers.get('Authorization');
  }

  it('a request to a platform API carries the bearer token', () => {
    expect(authorizationSentTo(`${TRADE}/api/v1/accounts/1/orders`)).toBe(`Bearer ${TOKEN}`);
    expect(authorizationSentTo(`${TRADE}/api/v1/orders`, 'POST')).toBe(`Bearer ${TOKEN}`);
  });

  it('a request to a third-party origin does not carry the bearer token', () => {
    expect(
      authorizationSentTo('https://y4t9nq2bqf.execute-api.eu-west-2.amazonaws.com/v1/quotes/AAPL'),
    ).toBeNull();
    expect(authorizationSentTo('https://analytics.example.com/collect')).toBeNull();
  });

  it('the unauthenticated auth routes are called without a header', () => {
    expect(authorizationSentTo(`${AUTH}/auth/login`, 'POST')).toBeNull();
    expect(authorizationSentTo(`${AUTH}/auth/register`, 'POST')).toBeNull();
    expect(authorizationSentTo(`${AUTH}/auth/refresh`, 'POST')).toBeNull();
  });

  it('the protected auth routes carry the bearer token', () => {
    expect(authorizationSentTo(`${AUTH}/auth/me`)).toBe(`Bearer ${TOKEN}`);
    expect(authorizationSentTo(`${AUTH}/profile`)).toBe(`Bearer ${TOKEN}`);
  });

  it('a look-alike of a platform origin does not carry the bearer token', () => {
    expect(authorizationSentTo('http://localhost:8081.evil.example/api/v1/orders')).toBeNull();
    expect(authorizationSentTo('https://localhost:8081/api/v1/orders')).toBeNull();
    expect(authorizationSentTo('http://localhost:9999/api/v1/orders')).toBeNull();
    expect(
      authorizationSentTo('http://evil.example/?next=http://localhost:8081/api/v1/'),
    ).toBeNull();
  });

  it('a platform origin outside the protected paths does not carry the bearer token', () => {
    expect(authorizationSentTo(`${TRADE}/actuator/health`)).toBeNull();
    expect(authorizationSentTo(`${AUTH}/docs`)).toBeNull();
    expect(authorizationSentTo(`${AUTH}/profile-photos`)).toBeNull();
  });

  it('a signed-out session sends no header anywhere', () => {
    accessToken.set(null);

    expect(authorizationSentTo(`${TRADE}/api/v1/accounts/1`)).toBeNull();
  });

  describe('keeping the session alive', () => {
    const URL = `${TRADE}/api/v1/accounts/1/orders`;

    it('renews a token about to expire before the request goes out', async () => {
      expiring = true;
      refresh.mockImplementation(async () => {
        accessToken.set('renewed');
        expiring = false;
        return true;
      });

      http.get(URL).subscribe();
      await Promise.resolve();

      const request = backend.expectOne(URL);
      expect(request.request.headers.get('Authorization')).toBe('Bearer renewed');
      request.flush([]);
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('renews and retries once when a request is refused with 401', async () => {
      refresh.mockImplementation(async () => {
        accessToken.set('renewed');
        return true;
      });
      let body: unknown;
      http.get(URL).subscribe((value) => (body = value));

      backend
        .expectOne(URL)
        .flush({ errorCode: 'AUTH-401' }, { status: 401, statusText: 'Unauthorized' });
      await Promise.resolve();
      const retry = backend.expectOne(URL);
      expect(retry.request.headers.get('Authorization')).toBe('Bearer renewed');
      retry.flush(['ok']);

      expect(body).toEqual(['ok']);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('does not renew again when another request already renewed the token', async () => {
      http.get(URL).subscribe();
      const first = backend.expectOne(URL);
      accessToken.set('renewed-elsewhere');
      first.flush({}, { status: 401, statusText: 'Unauthorized' });
      await Promise.resolve();

      const retry = backend.expectOne(URL);
      expect(retry.request.headers.get('Authorization')).toBe('Bearer renewed-elsewhere');
      retry.flush({});
      expect(refresh).not.toHaveBeenCalled();
    });

    it('sends the customer to sign in, coming back here, when the refresh is refused', async () => {
      refresh.mockResolvedValue(false);
      let failed: unknown;
      http.get(URL).subscribe({ error: (error) => (failed = error) });

      backend.expectOne(URL).flush({}, { status: 401, statusText: 'Unauthorized' });
      await Promise.resolve();
      await Promise.resolve();

      expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/orders' } });
      expect((failed as { status: number }).status).toBe(401);
    });

    it('retries only once: a second 401 is passed on, not looped', async () => {
      refresh.mockImplementation(async () => {
        accessToken.set('renewed');
        return true;
      });
      let failed: unknown;
      http.get(URL).subscribe({ error: (error) => (failed = error) });

      backend.expectOne(URL).flush({}, { status: 401, statusText: 'Unauthorized' });
      await Promise.resolve();
      backend.expectOne(URL).flush({}, { status: 401, statusText: 'Unauthorized' });

      expect((failed as { status: number }).status).toBe(401);
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('never renews for a request that carries no token', () => {
      expiring = true;
      http.post(`${AUTH}/auth/login`, {}).subscribe();
      backend.expectOne(`${AUTH}/auth/login`).flush({});
      expect(refresh).not.toHaveBeenCalled();
    });
  });

  describe('behind one address (CloudFront, or the gateway on port 80)', () => {
    const SITE = 'https://d1example.cloudfront.net';
    const list = tokenAllowList({ authApiUrl: `${SITE}/auth-api`, tradeApiUrl: SITE });

    it('the protected routes under the auth prefix and the trade API carry the token', () => {
      expect(mayCarryToken(`${SITE}/auth-api/auth/me`, list)).toBe(true);
      expect(mayCarryToken(`${SITE}/auth-api/profile`, list)).toBe(true);
      expect(mayCarryToken(`${SITE}/api/v1/orders`, list)).toBe(true);
    });

    it('the UI pages and the open auth routes on the same address do not', () => {
      expect(mayCarryToken(`${SITE}/profile`, list)).toBe(false);
      expect(mayCarryToken(`${SITE}/auth-api/auth/login`, list)).toBe(false);
      expect(mayCarryToken(`${SITE}/main.js`, list)).toBe(false);
    });
  });
});
