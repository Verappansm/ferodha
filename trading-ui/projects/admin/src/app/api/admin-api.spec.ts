import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdminApi, provideAdminClients } from './admin-api';
import { passwordDigest } from '../core/auth/password-digest';

const AUTH = 'http://auth.test';

describe('AdminApi sign-in', () => {
  it('sends the password digest, never the password (B23)', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideAdminClients({ authApiUrl: AUTH, tradeApiUrl: 'http://trade.test' }),
      ],
    });
    TestBed.inject(AdminApi)
      .login('Michael.Brown@example.com', 'seed-password-change-me')
      .subscribe();

    const request = TestBed.inject(HttpTestingController).expectOne(`${AUTH}/auth/admin/login`);
    expect(request.request.body).toEqual({
      username: 'Michael.Brown@example.com',
      password: passwordDigest('michael.brown@example.com', 'seed-password-change-me'),
    });
    expect(JSON.stringify(request.request.body)).not.toContain('seed-password-change-me');
  });
});
