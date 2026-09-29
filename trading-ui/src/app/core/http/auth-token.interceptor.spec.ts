import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Session } from '../session/session';
import { authTokenInterceptor } from './auth-token.interceptor';
import { TOKEN_ALLOW_LIST, tokenAllowList } from './token-allow-list';

const TRADE = 'http://localhost:8094';
const AUTH = 'http://localhost:8096';
const TOKEN = 'header.payload.signature';

describe('authTokenInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let accessToken: WritableSignal<string | null>;

  beforeEach(() => {
    accessToken = signal<string | null>(TOKEN);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authTokenInterceptor])),
        provideHttpClientTesting(),
        { provide: Session, useValue: { accessToken } },
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

  it('the protected auth route carries the bearer token', () => {
    expect(authorizationSentTo(`${AUTH}/auth/me`)).toBe(`Bearer ${TOKEN}`);
  });

  it('a look-alike of a platform origin does not carry the bearer token', () => {
    expect(authorizationSentTo('http://localhost:8094.evil.example/api/v1/orders')).toBeNull();
    expect(authorizationSentTo('https://localhost:8094/api/v1/orders')).toBeNull();
    expect(authorizationSentTo('http://localhost:9999/api/v1/orders')).toBeNull();
    expect(
      authorizationSentTo('http://evil.example/?next=http://localhost:8094/api/v1/'),
    ).toBeNull();
  });

  it('a platform origin outside the protected paths does not carry the bearer token', () => {
    expect(authorizationSentTo(`${TRADE}/actuator/health`)).toBeNull();
    expect(authorizationSentTo(`${AUTH}/docs`)).toBeNull();
  });

  it('a signed-out session sends no header anywhere', () => {
    accessToken.set(null);

    expect(authorizationSentTo(`${TRADE}/api/v1/accounts/1`)).toBeNull();
  });
});
