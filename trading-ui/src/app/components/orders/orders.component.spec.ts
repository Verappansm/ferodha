import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { CANCEL_TOO_LATE, MAX_POLLS, OrdersComponent, POLL_INTERVAL_MS } from './orders.component';
import { Session } from '../../core/session/session';
import { OrderHistoryEntry, OrderSide, OrderStatus, TradeApi } from '../../api/trade-api';
import { ERROR_MESSAGES } from '../../core/errors/error-message';
import { provideStubPreferences } from '../../core/preferences/preferences.testing';

function order(
  orderId: string,
  status: OrderStatus,
  createdOn: string,
  extra: Partial<OrderHistoryEntry> = {},
): OrderHistoryEntry {
  return {
    orderId,
    accountId: 3,
    symbol: 'AAPL',
    side: OrderSide.BUY,
    quantity: 10,
    price: 150,
    executedPrice: status === OrderStatus.FILLED ? 149.5 : null,
    status,
    createdOn,
    instrumentCurrency: 'USD',
    accountCurrency: 'USD',
    filledQuantity: status === OrderStatus.FILLED ? 10 : 0,
    estimatedValueAccountCurrency: 1500,
    ...extra,
  };
}

describe('OrdersComponent', () => {
  let fixture: ComponentFixture<OrdersComponent>;
  let orderHistory: ReturnType<typeof vi.fn>;
  let placeOrder: ReturnType<typeof vi.fn>;
  let cancelOrder: ReturnType<typeof vi.fn>;
  let accountId: ReturnType<typeof signal<number | null>>;

  beforeEach(async () => {
    orderHistory = vi.fn().mockReturnValue(of([]));
    placeOrder = vi.fn();
    cancelOrder = vi.fn();
    accountId = signal<number | null>(3);
    await TestBed.configureTestingModule({
      imports: [OrdersComponent],
      providers: [
        provideRouter([]),
        { provide: Session, useValue: { accountId } },
        provideStubPreferences(),
        { provide: TradeApi, useValue: { orderHistory, placeOrder, cancelOrder } },
      ],
    }).compileComponents();
    vi.useFakeTimers();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
  });

  /** Creates the blotter and lets its first read land. */
  async function open(): Promise<void> {
    fixture = TestBed.createComponent(OrdersComponent);
    await settle();
  }

  async function settle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
  }

  async function wait(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    fixture.detectChanges();
  }

  function byTestId(id: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`);
  }

  function allByTestId(id: string): HTMLElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>(`[data-testid="${id}"]`),
    );
  }

  it('order history renders newest first including rejections', async () => {
    orderHistory.mockReturnValue(
      of([
        order('ORD-old', OrderStatus.FILLED, '2026-09-28T09:00:00Z'),
        order('ORD-newest', OrderStatus.REJECTED, '2026-09-30T09:00:00Z'),
        order('ORD-middle', OrderStatus.CANCELLED, '2026-09-29T09:00:00Z'),
      ]),
    );

    await open();

    expect(orderHistory).toHaveBeenCalledWith(3);
    expect(allByTestId('order-id').map((td) => td.textContent?.trim())).toEqual([
      'ORD-newest',
      'ORD-middle',
      'ORD-old',
    ]);
    expect(allByTestId('order-status-badge')[0].textContent).toContain('REJECTED');
  });

  it('renders formatted dates and values, with no executed price until filled', async () => {
    orderHistory.mockReturnValue(
      of([
        order('ORD-1', OrderStatus.FILLED, '2026-09-28T09:14:00Z', {
          quantity: 1000,
          price: 25.5,
          executedPrice: 25.48,
        }),
        order('ORD-2', OrderStatus.REJECTED, '2026-09-27T09:14:00Z', { price: 99 }),
      ]),
    );

    await open();

    const [filled, rejected] = allByTestId('order-row').map((row) => row.textContent ?? '');
    expect(filled).toContain('28 Sep 2026');
    expect(filled).toContain('1,000');
    expect(filled).toContain('25.50');
    expect(filled).toContain('25.48');
    // Value uses the fill price once filled: 1000 × 25.48.
    expect(filled).toContain('25,480.00');
    expect(rejected).toContain('—');
  });

  it('every status badge carries its word, not only a colour', async () => {
    orderHistory.mockReturnValue(
      of([
        order('ORD-1', OrderStatus.NEW, '2026-09-30T09:04:00Z'),
        order('ORD-2', OrderStatus.FILLED, '2026-09-30T09:03:00Z'),
        order('ORD-3', OrderStatus.REJECTED, '2026-09-30T09:02:00Z'),
        order('ORD-4', OrderStatus.CANCELLED, '2026-09-30T09:01:00Z'),
      ]),
    );

    await open();

    const words = allByTestId('order-status-badge').map((b) => b.textContent);
    expect(words[0]).toContain('NEW (IN PROCESS)');
    expect(words[1]).toContain('FILLED');
    expect(words[2]).toContain('REJECTED');
    expect(words[3]).toContain('CANCELLED');
  });

  it('an order at NEW is shown as still working', async () => {
    orderHistory.mockReturnValue(of([order('ORD-1', OrderStatus.NEW, '2026-09-30T09:00:00Z')]));

    await open();

    expect(allByTestId('order-status-badge')[0].textContent).toContain('NEW (IN PROCESS)');
    expect(byTestId('orders-polling')).toBeTruthy();
  });

  it('a partially filled order renders as still working instead of crashing', async () => {
    // trade_api returns PARTIALLY_FILLED under market-sim (contract-breach.md, B13);
    // the generated client's OrderStatus does not include it.
    const partial = order('ORD-1', OrderStatus.NEW, '2026-09-30T09:00:00Z', {
      status: 'PARTIALLY_FILLED' as OrderStatus,
    });
    orderHistory.mockReturnValue(of([partial]));

    await open();

    expect(allByTestId('order-status-badge')[0].textContent).toContain(
      'PARTIALLY FILLED (IN PROCESS)',
    );
    expect(byTestId('orders-polling')).toBeTruthy();
  });

  it('a status nobody planned for renders its own word', async () => {
    orderHistory.mockReturnValue(
      of([
        order('ORD-1', OrderStatus.FILLED, '2026-09-30T09:00:00Z', {
          status: 'EXPIRED' as OrderStatus,
        }),
      ]),
    );

    await open();

    expect(allByTestId('order-status-badge')[0].textContent).toContain('EXPIRED');
  });

  it('the re-read stops when nothing is at NEW', async () => {
    orderHistory
      .mockReturnValueOnce(of([order('ORD-1', OrderStatus.NEW, '2026-09-30T09:00:00Z')]))
      .mockReturnValue(of([order('ORD-1', OrderStatus.FILLED, '2026-09-30T09:00:00Z')]));

    await open();
    expect(orderHistory).toHaveBeenCalledTimes(1);

    await wait(POLL_INTERVAL_MS);
    expect(orderHistory).toHaveBeenCalledTimes(2);
    expect(allByTestId('order-status-badge')[0].textContent).toContain('FILLED');
    expect(byTestId('orders-polling')).toBeNull();

    // Nothing is working any more, so no further read happens.
    await wait(POLL_INTERVAL_MS * 5);
    expect(orderHistory).toHaveBeenCalledTimes(2);
  });

  it('the re-read is bounded even if an order stays at NEW', async () => {
    orderHistory.mockReturnValue(of([order('ORD-1', OrderStatus.NEW, '2026-09-30T09:00:00Z')]));

    await open();
    await wait(POLL_INTERVAL_MS * (MAX_POLLS + 5));

    // The first read plus MAX_POLLS re-reads, then it stops.
    expect(orderHistory).toHaveBeenCalledTimes(1 + MAX_POLLS);
    expect(byTestId('orders-stalled')).toBeTruthy();
  });

  it('refresh re-reads at once and restarts the re-read', async () => {
    orderHistory.mockReturnValue(of([order('ORD-1', OrderStatus.NEW, '2026-09-30T09:00:00Z')]));
    await open();
    await wait(POLL_INTERVAL_MS * (MAX_POLLS + 1));
    expect(orderHistory).toHaveBeenCalledTimes(1 + MAX_POLLS);

    byTestId('orders-refresh')!.click();
    await settle();

    expect(orderHistory).toHaveBeenCalledTimes(2 + MAX_POLLS);
    expect(byTestId('orders-stalled')).toBeNull();
    expect(byTestId('orders-polling')).toBeTruthy();
  });

  it('never re-posts an order', async () => {
    orderHistory.mockReturnValue(of([order('ORD-1', OrderStatus.NEW, '2026-09-30T09:00:00Z')]));

    await open();
    await wait(POLL_INTERVAL_MS * (MAX_POLLS + 1));
    byTestId('orders-refresh')!.click();
    await settle();

    expect(placeOrder).not.toHaveBeenCalled();
  });

  it('stops re-reading when the page is left', async () => {
    orderHistory.mockReturnValue(of([order('ORD-1', OrderStatus.NEW, '2026-09-30T09:00:00Z')]));

    await open();
    fixture.destroy();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);

    expect(orderHistory).toHaveBeenCalledTimes(1);
  });

  it('empty history is handled gracefully', async () => {
    orderHistory.mockReturnValue(of([]));

    await open();

    expect(byTestId('orders-empty')?.textContent).toContain('You have not placed any orders yet');
    expect(byTestId('orders-table')).toBeNull();
    expect(byTestId('orders-error')).toBeNull();
  });

  it('a failed read shows a readable sentence', async () => {
    orderHistory.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 401,
            error: { errorCode: 'AUTH-401', message: 'Unauthorised' },
          }),
      ),
    );

    await open();

    expect(byTestId('orders-error')?.textContent).toContain(ERROR_MESSAGES['AUTH-401']);
  });

  it('asks the user to sign in when there is no account', async () => {
    accountId.set(null);

    await open();

    expect(orderHistory).not.toHaveBeenCalled();
    expect(byTestId('orders-error')?.textContent).toContain('Sign in to see your orders');
  });

  describe('open orders and cancellation (LEAP-018)', () => {
    function click(id: string): void {
      byTestId(id)!.click();
      fixture.detectChanges();
    }

    it('lists open orders apart from finished ones, each with a cancel control', async () => {
      orderHistory.mockReturnValue(
        of([
          order('ORD-open', OrderStatus.NEW, '2026-09-30T09:00:00Z'),
          order('ORD-done', OrderStatus.FILLED, '2026-09-29T09:00:00Z'),
        ]),
      );
      await open();

      const openTable = byTestId('open-orders-table')!;
      const history = byTestId('orders-table')!;
      expect(openTable.textContent).toContain('ORD-open');
      expect(openTable.textContent).not.toContain('ORD-done');
      expect(history.textContent).toContain('ORD-done');
      expect(allByTestId('cancel-order')).toHaveLength(1);
    });

    it('cancels once, only after the confirmation, and shows CANCELLED after the re-read', async () => {
      orderHistory.mockReturnValue(of([order('ORD-abc', OrderStatus.NEW, '2026-09-30T09:00:00Z')]));
      cancelOrder.mockReturnValue(of({ orderId: 'ORD-abc', status: OrderStatus.CANCELLED }));
      await open();

      click('cancel-order');
      expect(cancelOrder).not.toHaveBeenCalled();
      // The question is its own full-width row under the order: the table never widens.
      const confirmRow = byTestId('cancel-confirm')!;
      expect(confirmRow.tagName).toBe('TR');
      expect(confirmRow.querySelector('td')?.getAttribute('colspan')).toBe('8');
      expect(confirmRow.textContent).toContain('Cancel BUY 10 AAPL at 150.00 USD?');

      orderHistory.mockReturnValue(
        of([order('ORD-abc', OrderStatus.CANCELLED, '2026-09-30T09:00:00Z')]),
      );
      click('cancel-yes');
      await settle();

      expect(cancelOrder).toHaveBeenCalledTimes(1);
      expect(cancelOrder).toHaveBeenCalledWith('ORD-abc');
      expect(byTestId('cancel-outcome')?.textContent).toContain('Order ORD-abc is cancelled.');
      expect(byTestId('open-orders-table')).toBeNull();
      expect(byTestId('orders-table')?.textContent).toContain('CANCELLED');
    });

    it('keeping the order sends nothing', async () => {
      orderHistory.mockReturnValue(of([order('ORD-abc', OrderStatus.NEW, '2026-09-30T09:00:00Z')]));
      await open();

      click('cancel-order');
      click('cancel-keep');

      expect(cancelOrder).not.toHaveBeenCalled();
      expect(byTestId('cancel-confirm')).toBeNull();
    });

    it('cancelling an order that has just filled shows the ORD-409 sentence', async () => {
      orderHistory.mockReturnValue(of([order('ORD-abc', OrderStatus.NEW, '2026-09-30T09:00:00Z')]));
      cancelOrder.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 409,
              error: { errorCode: 'ORD-409', message: 'Order cannot be cancelled' },
            }),
        ),
      );
      await open();

      orderHistory.mockReturnValue(
        of([order('ORD-abc', OrderStatus.FILLED, '2026-09-30T09:00:00Z')]),
      );
      click('cancel-order');
      click('cancel-yes');
      await settle();

      expect(byTestId('cancel-outcome')?.textContent?.trim()).toBe(CANCEL_TOO_LATE);
      expect(byTestId('orders-table')?.textContent).toContain('FILLED');
    });

    it('a status filter lists only that status, through the route parameter', async () => {
      await open();
      orderHistory.mockClear();
      orderHistory.mockReturnValue(
        of([order('ORD-x', OrderStatus.REJECTED, '2026-09-30T09:00:00Z')]),
      );

      fixture.componentInstance.statusFilter = OrderStatus.REJECTED;
      fixture.componentInstance.applyFilters();
      await settle();

      expect(orderHistory).toHaveBeenCalledWith(3, { status: OrderStatus.REJECTED });
      expect(allByTestId('order-row')).toHaveLength(1);
      expect(byTestId('filter-clear')).not.toBeNull();
    });

    it('a date range covers whole local days, and from after to is refused', async () => {
      await open();
      orderHistory.mockClear();

      fixture.componentInstance.fromDate = '2026-09-01';
      fixture.componentInstance.toDate = '2026-09-30';
      fixture.componentInstance.applyFilters();
      await settle();
      expect(orderHistory).toHaveBeenCalledWith(3, {
        from: new Date('2026-09-01T00:00:00').toISOString(),
        to: new Date('2026-09-30T23:59:59.999').toISOString(),
      });

      orderHistory.mockClear();
      fixture.componentInstance.fromDate = '2026-10-05';
      fixture.componentInstance.applyFilters();
      await settle();
      expect(orderHistory).not.toHaveBeenCalled();
      expect(byTestId('orders-error')?.textContent).toContain('on or before');
    });
  });
});
