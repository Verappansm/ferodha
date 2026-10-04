import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PortfolioComponent } from './portfolio.component';
import { Session } from '../../core/session/session';
import { PortfolioApi, PortfolioSummary, PricedPosition } from '../../api/portfolio-api';
import { ERROR_MESSAGES } from '../../core/errors/error-message';

const SUMMARY: PortfolioSummary = {
  accountId: 3,
  baseCurrency: 'USD',
  cashBalance: 1000,
  marketValue: 1100,
  costBasis: 1250,
  unrealisedPnl: 100,
  unrealisedPnlPercent: 10,
  realisedPnl: -20,
  totalValue: 2100,
  positionCount: 2,
  partial: true,
  asOf: '2026-10-04T12:00:00Z',
};

const PRICED: PricedPosition = {
  accountId: 3,
  symbol: 'AAPL',
  quantity: 10,
  averageCost: 100,
  costBasis: 1000,
  lastPrice: 110,
  marketValue: 1100,
  unrealisedPnl: 100,
  unrealisedPnlPercent: 10,
  currency: 'USD',
  priceAsOf: '2026-10-04T11:00:00Z',
  stale: true,
};

const UNPRICED: PricedPosition = {
  accountId: 3,
  symbol: 'TSLA',
  quantity: 1,
  averageCost: 250,
  costBasis: 250,
  lastPrice: null,
  marketValue: null,
  unrealisedPnl: null,
  unrealisedPnlPercent: null,
  currency: 'USD',
  priceAsOf: null,
  stale: true,
};

describe('PortfolioComponent', () => {
  let fixture: ComponentFixture<PortfolioComponent>;
  let summary: ReturnType<typeof vi.fn>;
  let positions: ReturnType<typeof vi.fn>;
  let pnl: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    summary = vi.fn().mockReturnValue(of(SUMMARY));
    positions = vi.fn().mockReturnValue(of([UNPRICED, PRICED]));
    pnl = vi.fn().mockReturnValue(
      of({
        accountId: 3,
        baseCurrency: 'USD',
        realisedPnl: -20,
        unrealisedPnl: 100,
        totalPnl: 80,
        asOf: '2026-10-04T12:00:00Z',
      }),
    );
    await TestBed.configureTestingModule({
      imports: [PortfolioComponent],
      providers: [
        provideRouter([]),
        { provide: Session, useValue: { accountId: signal<number | null>(3) } },
        { provide: PortfolioApi, useValue: { summary, positions, pnl } },
      ],
    }).compileComponents();
  });

  function open(): void {
    fixture = TestBed.createComponent(PortfolioComponent);
    fixture.detectChanges();
  }

  function text(testId: string): string {
    const element: HTMLElement | null = fixture.nativeElement.querySelector(
      `[data-testid="${testId}"]`,
    );
    return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  it('gives every gain and loss a sign and a word, not colour alone', () => {
    open();
    expect(text('portfolio-unrealised')).toBe('+100.00 USD');
    expect(text('portfolio-realised')).toBe('−20.00 USD');
    expect(text('portfolio-summary')).toContain('Gain (+10.00%)');
    expect(text('portfolio-summary')).toContain('Loss, booked at each sale');
    expect(text('portfolio-row')).toContain('+100.00 Gain');
  });

  it('lists the priced holding first and shows a stale price with the time it was priced', () => {
    open();
    const rows: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid="portfolio-row"]'),
    );
    expect(rows.map((row) => row.querySelector('.symbol')?.textContent)).toEqual(['AAPL', 'TSLA']);
    expect(rows[0].textContent).toMatch(/Stale, priced /);
    expect(rows[1].textContent).toContain('No price');
    expect(rows[1].textContent).toContain('Not priced');
    expect(text('portfolio-partial')).toContain('could not be priced');
  });

  it('renders a readable empty state for an empty portfolio', () => {
    positions.mockReturnValue(of([]));
    open();
    expect(text('portfolio-empty')).toContain('You do not hold anything yet');
  });

  it('keeps the holdings on screen when the totals fail', () => {
    summary.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 503,
            error: { errorCode: 'MKT-503', message: 'Pricing unavailable' },
          }),
      ),
    );
    open();
    expect(text('portfolio-summary-error')).toBe(ERROR_MESSAGES['MKT-503']);
    expect(fixture.nativeElement.querySelectorAll('[data-testid="portfolio-row"]').length).toBe(2);
  });

  it('sorts by symbol when the column is chosen', () => {
    open();
    fixture.componentInstance.sort('symbol');
    expect(fixture.componentInstance.sortedHoldings().map((h) => h.symbol)).toEqual([
      'AAPL',
      'TSLA',
    ]);
    fixture.componentInstance.sort('symbol');
    expect(fixture.componentInstance.sortedHoldings().map((h) => h.symbol)).toEqual([
      'TSLA',
      'AAPL',
    ]);
  });
});
