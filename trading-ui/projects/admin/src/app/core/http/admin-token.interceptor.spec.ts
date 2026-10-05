import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AdminSession } from '../session/admin-session';
import {
  ADMIN_TOKEN_ALLOW_LIST,
  adminTokenAllowList,
  adminTokenInterceptor,
} from './admin-token.interceptor';

const TRADE = 'http://localhost:8080';
const AUTH = 'http://localhost:3000';

describe('adminTokenInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  const accessToken = signal<string | null>('admin-token');

  beforeEach(() => {
    accessToken.set('admin-token');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([adminTokenInterceptor])),
        provideHttpClientTesting(),
        { provide: AdminSession, useValue: { accessToken } },
        {
          provide: ADMIN_TOKEN_ALLOW_LIST,
          useValue: adminTokenAllowList({ authApiUrl: AUTH, tradeApiUrl: TRADE }),
        },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  function authorizationSentTo(url: string, method: 'GET' | 'POST' = 'GET'): string | null {
    (method === 'GET' ? http.get(url) : http.post(url, {})).subscribe();
    const request = backend.expectOne(url);
    request.flush({});
    return request.request.headers.get('Authorization');
  }

  it('an admin route on the Trade REST API carries the admin token', () => {
    expect(authorizationSentTo(`${TRADE}/api/v1/admin/summary`)).toBe('Bearer admin-token');
  });

  it('an admin route on the Auth service carries the admin token', () => {
    expect(authorizationSentTo(`${AUTH}/admin/users`)).toBe('Bearer admin-token');
  });

  it('the admin sign-in route is called without a header', () => {
    expect(authorizationSentTo(`${AUTH}/auth/admin/login`, 'POST')).toBeNull();
  });

  it('a customer route never carries the admin token', () => {
    expect(authorizationSentTo(`${TRADE}/api/v1/orders`, 'POST')).toBeNull();
    expect(authorizationSentTo(`${AUTH}/auth/me`)).toBeNull();
  });

  it('a third-party origin does not carry the admin token', () => {
    expect(authorizationSentTo('https://analytics.example.com/api/v1/admin/summary')).toBeNull();
    expect(
      authorizationSentTo('http://localhost:8080.evil.example/api/v1/admin/summary'),
    ).toBeNull();
  });
});
