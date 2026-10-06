import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { OrderingComponent } from './ordering.component';
import { Session } from '../../core/session/session';
import {
  TradeApi,
  OrderResponse,
  OrderReviewRequest,
  OrderReviewResponse,
  OrderStatus,
  OrderSide,
} from '../../api/trade-api';

/** What trade_api's review answers for a ticket: a 0.1% fee and 100,000 USD of cash. */
function reviewOf(order: OrderReviewRequest): OrderReviewResponse {
  const estimatedCost = order.quantity * order.price;
  const fee = Math.round(estimatedCost * 0.001 * 100) / 100;
  const buy = order.side === OrderSide.BUY;
  const total = buy ? estimatedCost + fee : estimatedCost - fee;
  return {
    ...order,
    currency: 'USD',
    estimatedCost,
    feeRate: 0.001,
    fee,
    total,
    cashBalance: 100000,
    accountCurrency: 'USD',
    cashRemaining: buy ? 100000 - total : null,
  };
}

describe('OrderingComponent', () => {
  let fixture: ComponentFixture<OrderingComponent>;
  let placeOrder: ReturnType<typeof vi.fn>;
  let reviewOrder: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;
  let back: ReturnType<typeof vi.fn>;
  let queryParams: BehaviorSubject<Params>;
  const accountId = signal(3);

  beforeEach(async () => {
    placeOrder = vi.fn().mockReturnValue(of({}));
    reviewOrder = vi.fn((order: OrderReviewRequest) => of(reviewOf(order)));
    navigate = vi.fn().mockResolvedValue(true);
    back = vi.fn();
    queryParams = new BehaviorSubject<Params>({});
    await TestBed.configureTestingModule({
      imports: [OrderingComponent],
      providers: [
        { provide: Session, useValue: { accountId } },
        {
          provide: TradeApi,
          useValue: {
            placeOrder,
            reviewOrder,
            quote: vi.fn().mockReturnValue(of(null)),
          },
        },
        { provide: ActivatedRoute, useValue: { queryParams } },
        { provide: Router, useValue: { navigate } },
        { provide: Location, useValue: { back } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(OrderingComponent);
    await fixture.whenStable();
  });

  function byTestId<T extends HTMLElement>(id: string): T | null {
    return (fixture.nativeElement as HTMLElement).querySelector<T>(`[data-testid="${id}"]`);
  }

  function input(id: string, value: string | number): void {
    const el = byTestId<HTMLInputElement>(id)!;
    el.value = String(value);
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('blur'));
  }

  function select(id: string, value: string): void {
    const el = byTestId<HTMLSelectElement>(id)!;
    el.value = value;
    el.dispatchEvent(new Event('change'));
  }

  async function click(id: string): Promise<void> {
    byTestId<HTMLButtonElement>(id)!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Review, then Confirm, as a customer would. On the review already, only Confirm. */
  async function submit(): Promise<void> {
    fixture.detectChanges();
    if (!byTestId('order-review')) {
      await click('order-submit');
    }
    if (byTestId('order-review')) {
      await click('order-review-confirm');
    }
  }

  it('renders the account read-only from the session token', () => {
    fixture.detectChanges();
    const accountInput = byTestId<HTMLInputElement>('order-account');
    expect(accountInput?.value).toBe('3');
    expect(accountInput?.readOnly).toBe(true);
  });

  it('a valid order submits and shows the returned status', async () => {
    const orderResponse: OrderResponse = {
      orderId: 'ORD-12345',
      status: OrderStatus.NEW,
      message: 'Order accepted',
      symbol: 'AAPL',
      side: OrderSide.BUY,
      quantity: 10,
      price: 150.0,
    };
    placeOrder.mockReturnValue(of(orderResponse));

    input('order-symbol', 'AAPL');
    select('order-side', OrderSide.BUY);
    input('order-quantity', '10');
    input('order-price', '150.00');

    await submit();

    expect(placeOrder).toHaveBeenCalledWith({
      accountId: 3,
      symbol: 'AAPL',
      side: OrderSide.BUY,
      quantity: 10,
      price: 150.0,
      idempotencyKey: expect.any(String), // UUID
    });

    fixture.detectChanges();
    expect(byTestId('order-result')).toBeTruthy();
    expect(byTestId('order-result-status')?.textContent).toContain(OrderStatus.NEW);
    expect(byTestId('order-result-id')?.textContent).toContain('ORD-12345');
  });

  it('an invalid quantity is blocked before submission', async () => {
    input('order-symbol', 'AAPL');
    select('order-side', OrderSide.BUY);
    input('order-quantity', '0'); // Invalid: not greater than zero
    input('order-price', '150.00');

    await submit();

    expect(placeOrder).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(byTestId('order-quantity-error')?.textContent).toContain('greater than zero');
  });

  it('a non-whole quantity is blocked before submission', async () => {
    input('order-symbol', 'AAPL');
    select('order-side', OrderSide.BUY);
    input('order-quantity', '10.5'); // Invalid: not a whole number
    input('order-price', '150.00');

    await submit();

    expect(placeOrder).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(byTestId('order-quantity-error')?.textContent).toContain('whole number');
  });

  it('a zero or negative price is blocked before submission', async () => {
    input('order-symbol', 'AAPL');
    select('order-side', OrderSide.BUY);
    input('order-quantity', '10');
    input('order-price', '0'); // Invalid: not greater than zero

    await submit();

    expect(placeOrder).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(byTestId('order-price-error')?.textContent).toContain('greater than zero');
  });

  it('a price with more than 2 decimal places is blocked before submission', async () => {
    input('order-symbol', 'AAPL');
    select('order-side', OrderSide.BUY);
    input('order-quantity', '10');
    input('order-price', '150.123'); // Invalid: 3 decimal places

    await submit();

    expect(placeOrder).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(byTestId('order-price-error')?.textContent).toContain('2 decimal places');
  });

  it('a price with exactly 2 decimal places is accepted', async () => {
    const orderResponse: OrderResponse = {
      orderId: 'ORD-12345',
      status: OrderStatus.NEW,
      message: 'Order accepted',
      symbol: 'AAPL',
      side: OrderSide.BUY,
      quantity: 10,
      price: 150.12,
    };
    placeOrder.mockReturnValue(of(orderResponse));

    input('order-symbol', 'AAPL');
    select('order-side', OrderSide.BUY);
    input('order-quantity', '10');
    input('order-price', '150.12');

    await submit();

    expect(placeOrder).toHaveBeenCalled();
    fixture.detectChanges();
    expect(byTestId('order-result')).toBeTruthy();
  });

  it('a business-rule rejection shows the mapped message', async () => {
    placeOrder.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: {
              errorCode: 'ORD-400',
              message: 'Insufficient funds',
            },
          }),
      ),
    );

    input('order-symbol', 'AAPL');
    select('order-side', OrderSide.BUY);
    input('order-quantity', '10');
    input('order-price', '150.00');

    await submit();

    fixture.detectChanges();
    expect(byTestId('order-error')?.textContent).toContain('Insufficient balance to place order');
  });

  it('an instrument not found rejection shows the mapped message', async () => {
    placeOrder.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            error: {
              errorCode: 'INS-404',
              message: 'Instrument not found',
            },
          }),
      ),
    );

    input('order-symbol', 'NOTREAL');
    select('order-side', OrderSide.BUY);
    input('order-quantity', '10');
    input('order-price', '150.00');

    await submit();

    fixture.detectChanges();
    expect(byTestId('order-error')?.textContent).toContain('not available to trade');
  });

  it('a sell beyond the holding shows the mapped message', async () => {
    placeOrder.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: {
              errorCode: 'ORD-409',
              message: 'Insufficient holdings',
            },
          }),
      ),
    );

    input('order-symbol', 'AAPL');
    select('order-side', OrderSide.BUY);
    input('order-quantity', '10');
    input('order-price', '150.00');

    await submit();

    fixture.detectChanges();
    expect(byTestId('order-error')?.textContent).toContain('do not hold enough units');
  });

  it('empty symbol is blocked before submission', async () => {
    input('order-quantity', '10');
    input('order-price', '150.00');

    await submit();

    expect(placeOrder).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(byTestId('order-symbol-error')?.textContent).toContain('symbol');
  });

  it('clears form after successful submission', async () => {
    const orderResponse: OrderResponse = {
      orderId: 'ORD-12345',
      status: OrderStatus.NEW,
      message: 'Order accepted',
      symbol: 'AAPL',
      side: OrderSide.BUY,
      quantity: 10,
      price: 150.0,
    };
    placeOrder.mockReturnValue(of(orderResponse));

    input('order-symbol', 'AAPL');
    input('order-quantity', '10');
    input('order-price', '150.00');

    await submit();

    fixture.detectChanges();
    expect(byTestId<HTMLInputElement>('order-symbol')?.value).toBe('');
    expect(byTestId<HTMLInputElement>('order-quantity')?.value).toBe('');
    expect(byTestId<HTMLInputElement>('order-price')?.value).toBe('');
  });

  function fillValidOrder(): void {
    input('order-symbol', 'AAPL');
    select('order-side', OrderSide.BUY);
    input('order-quantity', '10');
    input('order-price', '150.00');
  }

  const networkFailure = () => throwError(() => new HttpErrorResponse({ status: 0 }));

  it('a retry after a network failure reuses the same idempotency key', async () => {
    placeOrder.mockReturnValueOnce(networkFailure()).mockReturnValueOnce(
      of({
        orderId: 'ORD-1',
        status: OrderStatus.NEW,
        message: 'Order accepted',
        symbol: 'AAPL',
        side: OrderSide.BUY,
        quantity: 10,
        price: 150,
      }),
    );
    fillValidOrder();

    await submit();
    expect(byTestId('order-error')?.textContent).toContain('could not confirm');
    await submit();

    expect(placeOrder).toHaveBeenCalledTimes(2);
    const firstKey = placeOrder.mock.calls[0][0].idempotencyKey;
    expect(placeOrder.mock.calls[1][0].idempotencyKey).toBe(firstKey);
  });

  it('a retry that meets ORD-409 says the order was already placed', async () => {
    placeOrder.mockReturnValueOnce(networkFailure()).mockReturnValueOnce(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: { errorCode: 'ORD-409', message: 'Duplicate' },
          }),
      ),
    );
    fillValidOrder();

    await submit();
    await submit();

    expect(byTestId('order-error')?.textContent).toContain('already placed');
  });

  it('editing the ticket after a network failure gives the order a new key', async () => {
    placeOrder.mockReturnValueOnce(networkFailure()).mockReturnValueOnce(networkFailure());
    fillValidOrder();

    await submit();
    await click('order-review-back');
    input('order-quantity', '11');
    await submit();

    expect(placeOrder.mock.calls[1][0].idempotencyKey).not.toBe(
      placeOrder.mock.calls[0][0].idempotencyKey,
    );
  });

  it('every new order gets a fresh random UUID as its key', async () => {
    fillValidOrder();
    await submit();
    fillValidOrder();
    await submit();

    const [first, second] = placeOrder.mock.calls.map((call) => call[0].idempotencyKey);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second).not.toBe(first);
  });

  it('a symbol longer than the contract allows is blocked before submission', async () => {
    fillValidOrder();
    input('order-symbol', 'A'.repeat(21));

    await submit();

    expect(placeOrder).not.toHaveBeenCalled();
    expect(byTestId('order-symbol-error')?.textContent).toContain('at most 20');
  });

  it('a symbol in the wrong shape is blocked before submission', async () => {
    fillValidOrder();
    input('order-symbol', 'AA PL!');

    await submit();

    expect(placeOrder).not.toHaveBeenCalled();
    expect(byTestId('order-symbol-error')?.textContent).toContain('such as AAPL');
  });

  it('accepts the prefixed and suffixed symbol forms and sends them upper-case', async () => {
    fillValidOrder();
    input('order-symbol', 'fx:eurusd');

    await submit();

    expect(placeOrder.mock.calls[0][0].symbol).toBe('FX:EURUSD');
  });

  it('a tiny price written in exponent form is blocked before submission', async () => {
    fillValidOrder();
    input('order-price', '0.0000001');

    await submit();

    expect(placeOrder).not.toHaveBeenCalled();
    expect(byTestId('order-price-error')?.textContent).toContain('2 decimal places');
  });

  describe('review and confirm (LEAP-017)', () => {
    it('Review shows the figures trade_api works out, and places nothing', async () => {
      fillValidOrder();
      await click('order-submit');

      expect(placeOrder).not.toHaveBeenCalled();
      expect(reviewOrder).toHaveBeenCalledWith({
        accountId: 3,
        symbol: 'AAPL',
        side: OrderSide.BUY,
        quantity: 10,
        price: 150,
      });
      expect(byTestId('order-review-cost')?.textContent).toContain('1,500.00');
      expect(byTestId('order-review-fee')?.textContent).toContain('1.50');
      expect(byTestId('order-review-total')?.textContent).toContain('1,501.50');
      expect(byTestId('order-review-cash')?.textContent).toContain('98,498.50');
    });

    it('a sell shows what it receives and no cash-remaining line', async () => {
      fillValidOrder();
      select('order-side', OrderSide.SELL);
      input('order-price', '150.00');
      await click('order-submit');

      expect(byTestId('order-review-total')?.textContent).toContain('1,498.50');
      expect(byTestId('order-review-cash')).toBeNull();
    });

    it('back returns to the ticket with every field kept', async () => {
      fillValidOrder();
      await click('order-submit');
      await click('order-review-back');

      expect(byTestId('order-review')).toBeNull();
      expect(fixture.componentInstance.form.getRawValue()).toEqual({
        symbol: 'AAPL',
        side: OrderSide.BUY,
        quantity: 10,
        price: 150,
      });
      expect(placeOrder).not.toHaveBeenCalled();
    });

    it('confirm places exactly the reviewed order', async () => {
      fillValidOrder();
      await click('order-submit');
      await click('order-review-confirm');

      expect(placeOrder).toHaveBeenCalledTimes(1);
      expect(placeOrder.mock.calls[0][0]).toMatchObject({
        symbol: 'AAPL',
        side: OrderSide.BUY,
        quantity: 10,
        price: 150,
      });
    });

    it('a review that cannot be worked out says so and cannot be confirmed', async () => {
      reviewOrder.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
      fillValidOrder();
      await click('order-submit');

      expect(byTestId('order-review-error')?.textContent).toContain('could not work out');
      expect(byTestId<HTMLButtonElement>('order-review-confirm')?.disabled).toBe(true);
    });

    it('a review the platform refuses shows its sentence', async () => {
      reviewOrder.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 404,
              error: { errorCode: 'INS-404', message: 'Instrument not found' },
            }),
        ),
      );
      fillValidOrder();
      await click('order-submit');

      expect(byTestId('order-review-error')?.textContent?.trim()).not.toBe('');
      expect(byTestId<HTMLButtonElement>('order-review-confirm')?.disabled).toBe(true);
    });

    it('without a cash figure (a sell, or another currency) there is no cash line', async () => {
      reviewOrder.mockImplementation((order: OrderReviewRequest) =>
        of({ ...reviewOf(order), accountCurrency: 'INR', cashRemaining: null }),
      );
      fillValidOrder();
      await click('order-submit');

      expect(byTestId('order-review-total')?.textContent).toContain('1,501.50');
      expect(byTestId('order-review-cash')).toBeNull();
      expect(byTestId<HTMLButtonElement>('order-review-confirm')?.disabled).toBe(false);
    });
  });

  describe('the review in the browser history', () => {
    it('Review adds the review flag to the URL as a new history entry', async () => {
      fillValidOrder();
      await click('order-submit');

      expect(navigate).toHaveBeenCalledWith(
        [],
        expect.objectContaining({ queryParams: { review: '1' }, replaceUrl: false }),
      );
    });

    it("the browser's Back from the review returns to the ticket with every field kept", async () => {
      fillValidOrder();
      await click('order-submit');
      queryParams.next({ review: '1' });

      queryParams.next({}); // what popping the history entry does
      fixture.detectChanges();

      expect(byTestId('order-review')).toBeNull();
      expect(fixture.componentInstance.form.getRawValue()).toEqual({
        symbol: 'AAPL',
        side: OrderSide.BUY,
        quantity: 10,
        price: 150,
      });
      expect(placeOrder).not.toHaveBeenCalled();
    });

    it("the page's Back button pops the review's history entry", async () => {
      fillValidOrder();
      await click('order-submit');
      await click('order-review-back');

      expect(back).toHaveBeenCalledTimes(1);
    });

    it('a review flag with no review behind it (a reload) is dropped from the URL', async () => {
      queryParams.next({ symbol: 'AAPL', review: '1' });

      expect(byTestId('order-review')).toBeNull();
      expect(navigate).toHaveBeenCalledWith(
        [],
        expect.objectContaining({ queryParams: { review: null }, replaceUrl: true }),
      );
    });

    it('the review flag changing never overwrites what was typed', async () => {
      queryParams.next({ symbol: 'AAPL', side: 'BUY', price: '150' });
      input('order-quantity', '10');
      input('order-price', '149.00');
      await click('order-submit');

      queryParams.next({ symbol: 'AAPL', side: 'BUY', price: '150', review: '1' });

      expect(fixture.componentInstance.form.controls.price.value).toBe(149);
    });
  });

  it('shows the order message from the API response', async () => {
    const orderResponse: OrderResponse = {
      orderId: 'ORD-12345',
      status: OrderStatus.NEW,
      message: 'Order accepted and queued for execution',
      symbol: 'AAPL',
      side: OrderSide.BUY,
      quantity: 10,
      price: 150.0,
    };
    placeOrder.mockReturnValue(of(orderResponse));

    input('order-symbol', 'AAPL');
    input('order-quantity', '10');
    input('order-price', '150.00');

    await submit();

    fixture.detectChanges();
    expect(byTestId('order-result-message')?.textContent).toContain(
      'Order accepted and queued for execution',
    );
  });
});

describe('OrderingComponent price suggestion', () => {
  const QUOTE = {
    symbol: 'AAPL',
    currency: 'USD',
    bid: 230.1,
    ask: 230.3,
    mid: 230.2,
    asOf: '2026-10-05T12:00:00Z',
    stale: false,
  };
  let quote: ReturnType<typeof vi.fn>;

  async function open(
    params: Record<string, string>,
    quoted: object = QUOTE,
  ): Promise<ComponentFixture<OrderingComponent>> {
    quote = vi.fn().mockReturnValue(of(quoted));
    await TestBed.configureTestingModule({
      imports: [OrderingComponent],
      providers: [
        { provide: Session, useValue: { accountId: signal(3) } },
        { provide: TradeApi, useValue: { placeOrder: vi.fn(), quote } },
        { provide: ActivatedRoute, useValue: { queryParams: of(params) } },
        { provide: Router, useValue: { navigate: vi.fn().mockResolvedValue(true) } },
        { provide: Location, useValue: { back: vi.fn() } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(OrderingComponent);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(400); // the symbol's quote lookup is debounced
    fixture.detectChanges();
    return fixture;
  }

  function text(fixture: ComponentFixture<OrderingComponent>, id: string): string {
    const el = (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`);
    return el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function priceInput(fixture: ComponentFixture<OrderingComponent>): HTMLInputElement {
    return (fixture.nativeElement as HTMLElement).querySelector('[data-testid="order-price"]')!;
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('takes symbol, side and price from the link, and shows the current price below', async () => {
    const fixture = await open({ symbol: 'AAPL', side: 'BUY', price: '230.35' });
    expect(fixture.componentInstance.form.getRawValue()).toMatchObject({
      symbol: 'AAPL',
      side: 'BUY',
      price: 230.35,
    });
    expect(quote).toHaveBeenCalledWith('AAPL');
    expect(text(fixture, 'order-current-price')).toContain('Current price 230.20 USD');
    expect(text(fixture, 'order-current-price')).toContain('bid 230.10 / ask 230.30');
    expect(text(fixture, 'order-suggested-price')).toContain(
      'Suggested limit 230.35 (+0.02% past the ask)',
    );
  });

  it('suggests a price from the quote when the link carries none (the market list)', async () => {
    const fixture = await open({ symbol: 'AAPL', side: 'SELL' });
    expect(fixture.componentInstance.form.controls.price.value).toBe(230.05);
    expect(text(fixture, 'order-suggested-price')).toContain('(−0.02% past the bid)');
  });

  it('moves the suggestion when the side changes, until the customer types a price', async () => {
    const fixture = await open({ symbol: 'AAPL', side: 'BUY' });
    const form = fixture.componentInstance.form;
    form.controls.side.setValue('SELL');
    expect(form.controls.price.value).toBe(230.05);

    const input = priceInput(fixture);
    input.value = '229';
    input.dispatchEvent(new Event('input'));
    form.controls.side.setValue('BUY');
    expect(form.controls.price.value).toBe(229);

    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector(
        '[data-testid="order-use-suggested"]',
      ) as HTMLButtonElement
    ).click();
    expect(form.controls.price.value).toBe(230.35);
  });

  it('labels a stale quote with when it was last priced', async () => {
    const fixture = await open(
      { symbol: 'AAPL' },
      { ...QUOTE, stale: true, asOf: '2026-10-05T09:30:00Z' },
    );
    expect(text(fixture, 'order-quote-stale')).toMatch(/^stale, last priced /);
  });

  it('says when the symbol has no price yet, and suggests nothing', async () => {
    const fixture = await open(
      { symbol: 'AAPL' },
      { ...QUOTE, bid: null, ask: null, mid: null, stale: true },
    );
    expect(text(fixture, 'order-current-price')).toBe('No live price for AAPL yet.');
    expect(fixture.componentInstance.form.controls.price.value).toBeNull();
  });

  it('reads no quote for a symbol that is not valid yet', async () => {
    const fixture = await open({});
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '[data-testid="order-symbol"]',
    )!;
    input.value = 'not a symbol!';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(400);
    expect(quote).not.toHaveBeenCalled();
  });
});
