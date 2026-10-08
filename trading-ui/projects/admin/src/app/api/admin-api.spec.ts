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

describe('AdminApi fees and instruments', () => {
  const TRADE = 'http://trade.test';
  let http: HttpTestingController;
  let api: AdminApi;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideAdminClients({ authApiUrl: AUTH, tradeApiUrl: TRADE }),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(AdminApi);
  });

  it('reads the fee summary', () => {
    api.feeSummary().subscribe();
    http.expectOne(`${TRADE}/api/v1/admin/fees/summary`).flush({});
  });

  it('asks for fees by user with the dates, search and page', () => {
    api
      .feesByUser({ from: '2026-10-01', to: '2026-10-31', q: 'john' }, { page: 1, size: 25 })
      .subscribe();
    const request = http.expectOne((r) => r.url === `${TRADE}/api/v1/admin/fees/by-user`);
    expect(request.request.params.get('from')).toBe('2026-10-01');
    expect(request.request.params.get('to')).toBe('2026-10-31');
    expect(request.request.params.get('q')).toBe('john');
    expect(request.request.params.get('page')).toBe('1');
    request.flush({});
  });

  it('leaves out an empty date or search', () => {
    api.feesByInstrument({ from: '', to: '' }).subscribe();
    const request = http.expectOne((r) => r.url === `${TRADE}/api/v1/admin/fees/by-instrument`);
    expect(request.request.params.keys()).toEqual([]);
    request.flush([]);
  });

  it('posts a new instrument to /admin/instruments', () => {
    api
      .addInstrument({
        ticker: 'NEWCO',
        name: 'NewCo',
        exchange: 'NASDAQ',
        currency: 'USD',
        type: 'EQUITY',
        reason: 'Listing requested',
      })
      .subscribe();
    const request = http.expectOne(`${TRADE}/api/v1/admin/instruments`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body.ticker).toBe('NEWCO');
    request.flush({});
  });
});
