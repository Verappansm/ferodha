import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideApiClients } from './provide-api-clients';
import { OrderSide, TradeApi } from './trade-api';

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
});
