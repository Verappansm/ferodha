import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PortfolioApi } from './portfolio-api';
import { provideApiClients } from './provide-api-clients';

const TRADE = 'http://trade.test';

describe('PortfolioApi', () => {
  let api: PortfolioApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClients({ authApiUrl: 'http://auth.test', tradeApiUrl: TRADE }),
      ],
    });
    api = TestBed.inject(PortfolioApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the summary from the Trade REST API', () => {
    api.summary(3).subscribe();
    expect(http.expectOne(`${TRADE}/api/v1/portfolio/3`).request.method).toBe('GET');
  });

  it('reads the priced positions', () => {
    api.positions(3).subscribe();
    http.expectOne(`${TRADE}/api/v1/portfolio/3/positions`);
  });

  it('passes the realised date range to the P&L route', () => {
    api.pnl(3, { from: '2026-10-04', to: '2026-10-04' }).subscribe();
    const request = http.expectOne((r) => r.url === `${TRADE}/api/v1/portfolio/3/pnl`);
    expect(request.request.params.get('from')).toBe('2026-10-04');
    expect(request.request.params.get('to')).toBe('2026-10-04');
  });
});
