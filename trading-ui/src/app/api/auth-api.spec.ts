import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthApi, TokenResponse } from './auth-api';
import { passwordDigest } from '../core/auth/password-digest';
import { provideApiClients } from './provide-api-clients';

const AUTH = 'http://auth.test';

describe('AuthApi', () => {
  let api: AuthApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClients({
          authApiUrl: AUTH,
          tradeApiUrl: 'http://trade.test',
        }),
      ],
    });
    api = TestBed.inject(AuthApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts the credentials to /auth/login on the Auth service', async () => {
    const tokens: TokenResponse = {
      accessToken: 'access',
      refreshToken: 'refresh',
      tokenType: 'Bearer',
      expiresIn: 900,
    };
    const response = firstValueFrom(api.login('john.carter@example.com', 'pw'));

    const request = http.expectOne(`${AUTH}/auth/login`);
    expect(request.request.method).toBe('POST');
    // The password is never sent: only its digest (B23).
    expect(request.request.body).toEqual({
      username: 'john.carter@example.com',
      password: passwordDigest('john.carter@example.com', 'pw'),
    });
    expect(JSON.stringify(request.request.body)).not.toContain('"pw"');
    request.flush(tokens);

    expect(await response).toEqual(tokens);
  });

  it('reads the current user from /auth/me', async () => {
    const response = firstValueFrom(api.currentUser());

    const request = http.expectOne(`${AUTH}/auth/me`);
    expect(request.request.method).toBe('GET');
    request.flush({
      id: 'u1',
      username: 'john.carter@example.com',
      accountId: 1,
      roles: ['CUSTOMER'],
    });

    expect((await response).accountId).toBe(1);
  });

  it('never sets an Authorization header itself', () => {
    api.currentUser().subscribe();

    const request = http.expectOne(`${AUTH}/auth/me`);
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush({});
  });

  it('registers with the password digest, never the password (B23)', () => {
    api.register('Priya Menon', 'priya@example.com', 'correct horse battery').subscribe();

    const request = http.expectOne(`${AUTH}/auth/register`);
    expect(request.request.body).toEqual({
      name: 'Priya Menon',
      username: 'priya@example.com',
      password: passwordDigest('priya@example.com', 'correct horse battery'),
    });
    request.flush({});
  });
});
