import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
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
    expect(byTestId('order-error')?.textContent).toContain('Insufficient funds to place this order');
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
    expect(byTestId('order-error')?.textContent).toContain('not found or not tradable');
  });

  it('duplicate order rejection shows the mapped message', async () => {
    placeOrder.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: {
              errorCode: 'ORD-409',
              message: 'Duplicate order',
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
    expect(byTestId('order-error')?.textContent).toContain('Cannot place this order');
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
