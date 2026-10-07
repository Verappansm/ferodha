import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { Session } from '../../core/session/session';
import { OrderHistoryEntry, OrderSide, OrderStatus, TradeApi } from '../../api/trade-api';
import { PortfolioApi, PricedPosition } from '../../api/portfolio-api';
import { ERROR_MESSAGES } from '../../core/errors/error-message';
import { provideStubPreferences } from '../../core/preferences/preferences.testing';

function order(
  orderId: string,
  createdOn: string,
  status: OrderStatus = OrderStatus.FILLED,
): OrderHistoryEntry {
  return {
    orderId,
    accountId: 3,
    symbol: 'AAPL',
    side: OrderSide.BUY,
    quantity: 10,
    price: 150,
    executedPrice: 149.5,
    status,
    createdOn,
  };
}

function position(
  symbol: string,
  marketValue: number | null,
  extra: Partial<PricedPosition> = {},
): PricedPosition {
  return {
    accountId: 3,
    symbol,
    quantity: 10,
    averageCost: 100,
    costBasis: 1000,
    lastPrice: marketValue === null ? null : marketValue / 10,
    marketValue,
    unrealisedPnl: marketValue === null ? null : marketValue - 1000,
    unrealisedPnlPercent: null,
    currency: 'USD',
    priceAsOf: marketValue === null ? null : '2026-10-04T12:00:00Z',
    stale: marketValue === null,
    ...extra,
  };
}

const PNL = {
  accountId: 3,
  baseCurrency: 'USD',
  from: '2026-10-04',
  to: '2026-10-04',
  realisedPnl: 40,
  unrealisedPnl: -15.5,
  totalPnl: 24.5,
  asOf: '2026-10-04T12:00:00Z',
};

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let balance: ReturnType<typeof vi.fn>;
  let orderHistory: ReturnType<typeof vi.fn>;
  let pnl: ReturnType<typeof vi.fn>;
  let positions: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    balance = vi
      .fn()
      .mockReturnValue(of({ accountId: 3, cashBalance: 2500.5, currency: 'USD', asOf: '' }));
    orderHistory = vi.fn().mockReturnValue(of([]));
    pnl = vi.fn().mockReturnValue(of(PNL));
    positions = vi.fn().mockReturnValue(of([]));
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: Session, useValue: { accountId: signal<number | null>(3) } },
        provideStubPreferences(),
        { provide: TradeApi, useValue: { balance, orderHistory } },
        { provide: PortfolioApi, useValue: { pnl, positions } },
      ],
    }).compileComponents();
  });

  function open(): void {
    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
  }

  function text(testId: string): string {
    const element: HTMLElement | null = fixture.nativeElement.querySelector(
      `[data-testid="${testId}"]`,
    );
    return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function all(testId: string): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll(`[data-testid="${testId}"]`));
  }

  describe('each panel renders its figures from the API response', () => {
    it('shows the cash balance in its currency', () => {
      open();
      expect(text('cash-amount')).toBe('2,500.50USD');
    });

    it("asks for today's P&L and shows it with a sign and a word, not colour alone", () => {
      open();
      const today = new Date().toISOString().slice(0, 10);
      expect(pnl).toHaveBeenCalledWith(3, { from: today, to: today });
      expect(text('pnl-total')).toBe('+24.50USD');
      expect(text('pnl-word')).toBe('Gain');
      expect(text('pnl-realised')).toBe('+40.00 Gain');
      expect(text('pnl-unrealised')).toBe('−15.50 Loss');
    });

    it('shows the five newest orders, newest first, with the blotter status badge', () => {
      orderHistory.mockReturnValue(
        of([
          order('ORD-1', '2026-10-01T09:00:00Z'),
          order('ORD-2', '2026-10-04T09:00:00Z', OrderStatus.NEW),
          order('ORD-3', '2026-10-02T09:00:00Z'),
          order('ORD-4', '2026-10-03T09:00:00Z'),
          order('ORD-5', '2026-09-30T09:00:00Z'),
          order('ORD-6', '2026-09-29T09:00:00Z'),
        ]),
      );
      open();
      const rows = all('orders-panel-row');
      expect(rows.length).toBe(5);
      expect(rows[0].querySelector('[data-testid="order-status-badge"]')?.textContent).toContain(
        'NEW (IN PROCESS)',
      );
      expect(fixture.componentInstance.orders().data?.map((o) => o.orderId)).toEqual([
        'ORD-2',
        'ORD-4',
        'ORD-3',
        'ORD-1',
        'ORD-5',
      ]);
    });

    it('shows the largest positions first, with an unpriced one last and marked', () => {
      positions.mockReturnValue(
        of([position('MSFT', 900), position('TSLA', null), position('AAPL', 1500)]),
      );
      open();
      const rows = all('positions-panel-row');
      expect(rows.map((row) => row.querySelector('.symbol')?.textContent)).toEqual([
        'AAPL',
        'MSFT',
        'TSLA',
      ]);
      expect(rows[0].textContent).toContain('+500.00 Gain');
      expect(rows[1].textContent).toContain('−100.00 Loss');
      expect(rows[2].textContent).toContain('Not priced');
      expect(text('positions-panel-stale')).toBe('No price');
    });

    it('marks a stale price with the time it was last priced', () => {
      positions.mockReturnValue(of([position('AAPL', 1500, { stale: true })]));
      open();
      expect(text('positions-panel-stale')).toMatch(/^Stale, priced /);
    });
  });

  describe('a failed panel shows a readable message while the others still render', () => {
    it('keeps cash, orders and positions when the P&L request fails', () => {
      pnl.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 503,
              error: { errorCode: 'MKT-503', message: 'Pricing unavailable' },
            }),
        ),
      );
      open();
      expect(text('pnl-error')).toBe(ERROR_MESSAGES['MKT-503']);
      expect(text('cash-amount')).toBe('2,500.50USD');
      expect(text('orders-panel-empty')).not.toBe('');
      expect(text('positions-panel-empty')).not.toBe('');
    });

    it('says when the service could not be reached, and retries only that panel', () => {
      balance.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
      open();
      expect(text('cash-error')).toContain('could not be reached');
      expect(text('pnl-total')).toBe('+24.50USD');

      const retry: HTMLButtonElement = fixture.nativeElement.querySelector(
        '[data-testid="cash-panel"] .retry',
      );
      retry.click();
      fixture.detectChanges();
      expect(text('cash-amount')).toBe('2,500.50USD');
      expect(balance).toHaveBeenCalledTimes(2);
      expect(pnl).toHaveBeenCalledTimes(1);
    });
  });

  describe('a new customer with no orders or positions sees helpful empty states', () => {
    it('points to the bank, the market list and explains where holdings appear', () => {
      balance.mockReturnValue(of({ accountId: 3, cashBalance: 0, currency: 'USD', asOf: '' }));
      pnl.mockReturnValue(of({ ...PNL, realisedPnl: 0, unrealisedPnl: 0, totalPnl: 0 }));
      open();
      expect(text('cash-empty')).toContain('Deposit from your bank');
      expect(text('orders-panel-empty')).toContain('Find an instrument');
      expect(text('positions-panel-empty')).toContain('You do not hold anything yet');
      expect(text('pnl-word')).toBe('No change');
    });
  });

  it('links each panel to its full page', () => {
    open();
    const links = Array.from(fixture.nativeElement.querySelectorAll('.panel-header a')).map((a) =>
      (a as HTMLAnchorElement).getAttribute('href'),
    );
    expect(links).toEqual(['/bank', '/portfolio', '/orders', '/portfolio']);
  });

  it('loads nothing without a signed-in account', () => {
    TestBed.overrideProvider(Session, { useValue: { accountId: signal<number | null>(null) } });
    open();
    expect(balance).not.toHaveBeenCalled();
    expect(pnl).not.toHaveBeenCalled();
  });
});
