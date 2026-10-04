import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { InstrumentDetailsComponent } from './instrument-details.component';
import { CHART_FACTORY } from './price-chart';
import { InstrumentQuote, PricePoint, TradeApi } from '../../api/trade-api';
import { ERROR_MESSAGES } from '../../core/errors/error-message';

const QUOTE: InstrumentQuote = {
  symbol: 'AAPL',
  currency: 'USD',
  bid: 230.1,
  ask: 230.3,
  mid: 230.2,
  asOf: '2026-10-05T12:00:00Z',
  stale: false,
  dayLow: 228,
  dayHigh: 232,
  previousClose: 229.5,
  week52Low: 160,
  week52High: 250,
};

function point(time: string, close: number): PricePoint {
  return { time, open: close, high: close + 1, low: close - 1, close };
}

describe('InstrumentDetailsComponent', () => {
  let fixture: ComponentFixture<InstrumentDetailsComponent>;
  let instrument: ReturnType<typeof vi.fn>;
  let quote: ReturnType<typeof vi.fn>;
  let history: ReturnType<typeof vi.fn>;
  let drawChart: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    instrument = vi.fn().mockReturnValue(
      of({
        symbol: 'AAPL',
        name: 'Apple Inc.',
        type: 'EQUITY',
        exchange: 'NASDAQ',
        currency: 'USD',
        sector: 'Technology',
      }),
    );
    quote = vi.fn().mockReturnValue(of(QUOTE));
    history = vi.fn().mockReturnValue(
      of({
        symbol: 'AAPL',
        range: '1M',
        interval: '1d',
        points: [point('2026-10-01T00:00:00Z', 200), point('2026-10-02T00:00:00Z', 210)],
      }),
    );
    drawChart = vi.fn().mockReturnValue({ destroy: vi.fn() });
    await TestBed.configureTestingModule({
      imports: [InstrumentDetailsComponent],
      providers: [
        provideRouter([]),
        { provide: TradeApi, useValue: { instrument, quote, history } },
        { provide: CHART_FACTORY, useValue: drawChart },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ symbol: 'AAPL' })) },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => fixture?.destroy());

  function open(): void {
    fixture = TestBed.createComponent(InstrumentDetailsComponent);
    fixture.detectChanges();
  }

  function text(testId: string): string {
    const element: HTMLElement | null = fixture.nativeElement.querySelector(
      `[data-testid="${testId}"]`,
    );
    return element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function click(testId: string): void {
    (fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  describe('buy and sell open the ticket pre-filled with symbol and side', () => {
    it.each(['BUY', 'SELL'] as const)('%s', (side) => {
      open();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      click(side === 'BUY' ? 'buy' : 'sell');

      expect(navigate).toHaveBeenCalledWith(['/order'], {
        queryParams: { symbol: 'AAPL', side },
      });
    });
  });

  describe('a stale quote is labelled stale with its time', () => {
    it('labels a stale quote with when it was last priced', () => {
      quote.mockReturnValue(of({ ...QUOTE, stale: true, asOf: '2026-10-05T09:30:00Z' }));
      open();
      expect(text('quote-stale')).toMatch(/^Stale: last priced .+/);
      expect(text('quote-stale')).toContain('2026');
    });

    it('says when no price has been received at all', () => {
      quote.mockReturnValue(
        of({ ...QUOTE, stale: true, asOf: null, mid: null, bid: null, ask: null }),
      );
      open();
      expect(text('quote-stale')).toBe('Stale: no price has been received');
      expect(text('quote')).toContain('No price yet.');
    });

    it('shows a live quote with bid, ask and its time, and no stale label', () => {
      open();
      expect(text('quote-mid')).toBe('230.20 USD');
      expect(text('quote')).toContain('Bid');
      expect(text('quote-time')).toMatch(/^Live, as of /);
      expect(text('quote-stale')).toBe('');
    });
  });

  describe('a range change reloads the chart only', () => {
    it('reads the new range without re-reading the quote or the instrument', () => {
      open();
      expect(history).toHaveBeenCalledWith('AAPL', '1M');
      expect(quote).toHaveBeenCalledTimes(1);

      click('range-1D');

      expect(history).toHaveBeenLastCalledWith('AAPL', '1D');
      expect(history).toHaveBeenCalledTimes(2);
      expect(quote).toHaveBeenCalledTimes(1);
      expect(instrument).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the current range is chosen again', () => {
      open();
      click('range-1M');
      expect(history).toHaveBeenCalledTimes(1);
    });
  });

  it('draws the closes and summarises them in words beside the chart', () => {
    open();
    expect(drawChart).toHaveBeenCalledTimes(1);
    expect(drawChart.mock.calls[0][1].closes).toEqual([200, 210]);
    expect(text('chart-summary')).toContain('between 199.00 and 211.00');
    expect(text('chart-summary')).toContain('+10.00 (+5.00%) Gain');
  });

  it('shows the key statistics and omits any the history cannot back', () => {
    quote.mockReturnValue(of({ ...QUOTE, previousClose: null }));
    open();
    expect(text('stats')).toContain('Day range');
    expect(text('stats')).toContain('52-week range');
    expect(text('stats')).not.toContain('Previous close');
  });

  it('explains an empty 1D chart rather than drawing nothing', () => {
    open();
    drawChart.mockClear();
    history.mockReturnValue(of({ symbol: 'AAPL', range: '1D', interval: '1m', points: [] }));
    click('range-1D');
    expect(text('history-empty')).toContain('Intraday prices are recorded');
    expect(drawChart).not.toHaveBeenCalled();
  });

  it('shows a readable message for an instrument that is not tradable', () => {
    instrument.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 404,
            error: { errorCode: 'INS-404', message: 'Instrument not found' },
          }),
      ),
    );
    open();
    expect(text('instrument-error')).toBe(ERROR_MESSAGES['INS-404']);
  });
});
