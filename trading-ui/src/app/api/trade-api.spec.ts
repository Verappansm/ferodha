import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideApiClients } from './provide-api-clients';
import {
  InstrumentType,
  OrderSide,
  OrderStatus,
  PaginatedInstrumentsResponse,
  TradeApi,
} from './trade-api';

const TRADE = 'http://trade.test';

describe('TradeApi', () => {
  let api: TradeApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClients({
          authApiUrl: 'http://auth.test',
          tradeApiUrl: TRADE,
        }),
      ],
    });
    api = TestBed.inject(TradeApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts a new order to /api/v1/orders on the Trade REST API', () => {
    const order = {
      accountId: 1,
      symbol: 'AAPL',
      side: OrderSide.BUY,
      quantity: 10,
      price: 189.5,
      idempotencyKey: 'order-1',
    };
    api.placeOrder(order).subscribe();

    const request = http.expectOne(`${TRADE}/api/v1/orders`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(order);
    request.flush({});
  });

  it('reads order history for the account', () => {
    api.orderHistory(1).subscribe();

    const request = http.expectOne(`${TRADE}/api/v1/accounts/1/orders`);
    expect(request.request.method).toBe('GET');
    request.flush([]);
  });

  it('reads the account', () => {
    api.account(7).subscribe();

    http.expectOne(`${TRADE}/api/v1/accounts/7`).flush({});
  });

  it('cancels with the bare UUID, without the ORD- display prefix', () => {
    api.cancelOrder('ORD-6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e').subscribe();

    const request = http.expectOne(`${TRADE}/api/v1/orders/6f2b1c2a-6a1e-4a4f-9c0d-2f7a1b3c4d5e`);
    expect(request.request.method).toBe('DELETE');
    request.flush({});
  });

  it('passes history filters as the route query parameters', () => {
    api.orderHistory(1, { status: OrderStatus.NEW, from: '2026-09-01T00:00:00.000Z' }).subscribe();

    const request = http.expectOne((r) => r.url === `${TRADE}/api/v1/accounts/1/orders`);
    expect(request.request.params.get('status')).toBe('NEW');
    // The generated client percent-encodes the value itself; the server decodes it.
    expect(decodeURIComponent(request.request.params.get('from')!)).toBe(
      '2026-09-01T00:00:00.000Z',
    );
    expect(request.request.params.has('to')).toBe(false);
    request.flush([]);
  });

  it('filters instruments by the search text when the generated client has no search parameter', () => {
    let result: PaginatedInstrumentsResponse | undefined;

    api.getInstruments(50, 0, 'app').subscribe((response) => {
      result = response;
    });

    const request = http.expectOne(`${TRADE}/api/v1/instruments?pageSize=50&offset=0`);
    expect(request.request.method).toBe('GET');
    request.flush({
      instruments: [
        {
          symbol: 'AAPL',
          name: 'Apple Inc.',
          type: InstrumentType.EQUITY,
          exchange: 'NASDAQ',
          currency: 'USD',
          sector: 'Technology',
        },
        {
          symbol: 'MSFT',
          name: 'Microsoft Corporation',
          type: InstrumentType.EQUITY,
          exchange: 'NASDAQ',
          currency: 'USD',
          sector: 'Technology',
        },
      ],
      total: 2,
      pageSize: 2,
      offset: 0,
    });

    expect(result?.instruments.map((instrument) => instrument.symbol)).toEqual(['AAPL']);
    expect(result?.total).toBe(1);
    expect(result?.pageSize).toBe(1);
  });
});
