import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { OrderingComponent } from './ordering.component';
import { Session } from '../../core/session/session';
import { TradeApi, OrderResponse, OrderStatus, OrderSide } from '../../api/trade-api';

describe('OrderingComponent', () => {
  let fixture: ComponentFixture<OrderingComponent>;
  let placeOrder: ReturnType<typeof vi.fn>;
  const accountId = signal(3);

  beforeEach(async () => {
    placeOrder = vi.fn().mockReturnValue(of({}));
    await TestBed.configureTestingModule({
      imports: [OrderingComponent],
      providers: [
        { provide: Session, useValue: { accountId } },
        { provide: TradeApi, useValue: { placeOrder } },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParams: of({}),
          },
        },
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

  async function submit(): Promise<void> {
    byTestId<HTMLButtonElement>('order-submit')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
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
