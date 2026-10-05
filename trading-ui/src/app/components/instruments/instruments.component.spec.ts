import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { InstrumentsComponent, PRICE_REFRESH_MS } from './instruments.component';
import { InstrumentResponse, InstrumentType, PriceSnapshot, TradeApi } from '../../api/trade-api';

function instrument(symbol: string): InstrumentResponse {
  return {
    symbol,
    name: `${symbol} Inc.`,
    type: InstrumentType.EQUITY,
    exchange: 'NASDAQ',
    currency: 'USD',
    sector: 'Technology',
  };
}

const PRICES: PriceSnapshot[] = [
  {
    symbol: 'AAPL',
    bid: 230.1,
    ask: 230.3,
    mid: 230.2,
    asOf: '2026-10-05T12:00:00Z',
    stale: false,
  },
  { symbol: 'MSFT', bid: null, ask: null, mid: 410.5, asOf: '2026-10-04T20:00:00Z', stale: true },
  { symbol: 'NVDA', bid: null, ask: null, mid: null, asOf: null, stale: true },
];

describe('InstrumentsComponent', () => {
  let fixture: ComponentFixture<InstrumentsComponent>;
  let prices: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    prices = vi.fn().mockReturnValue(of(PRICES));
    await TestBed.configureTestingModule({
      imports: [InstrumentsComponent],
      providers: [
        provideRouter([]),
        {
          provide: TradeApi,
          useValue: {
            getInstruments: vi.fn().mockReturnValue(
              of({
                instruments: [instrument('AAPL'), instrument('MSFT'), instrument('NVDA')],
                total: 3,
                pageSize: 1000,
                offset: 0,
              }),
            ),
            prices,
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(InstrumentsComponent);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  function priceCells(): string[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="instrument-price"]'),
      (cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );
  }

  it('prices every row on screen with one request', () => {
    expect(prices).toHaveBeenCalledWith(['AAPL', 'MSFT', 'NVDA']);
    expect(priceCells()).toEqual(['230.20', '410.50•', '—']);
  });

  it('marks a stale price, and shows a dash when there is none', () => {
    const msft = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="instrument-price"]',
    )[1];
    expect(msft.querySelector('.stale-dot')?.getAttribute('title')).toBe('Stale price');
  });

  it('keeps the prices current while the page is open', async () => {
    prices.mockClear();
    await vi.advanceTimersByTimeAsync(PRICE_REFRESH_MS);
    expect(prices).toHaveBeenCalledTimes(1);
  });

  it('keeps the last prices when a refresh fails', async () => {
    prices.mockReturnValue(throwError(() => new Error('down')));
    await vi.advanceTimersByTimeAsync(PRICE_REFRESH_MS);
    fixture.detectChanges();
    expect(priceCells()[0]).toBe('230.20');
  });

  it('opens the ticket with a suggested price when there is a quote', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fixture.componentInstance.buyInstrument('AAPL');
    fixture.componentInstance.sellInstrument('NVDA');

    expect(navigate).toHaveBeenCalledWith(['/order'], {
      queryParams: { symbol: 'AAPL', side: 'BUY', price: 230.35 },
    });
    expect(navigate).toHaveBeenCalledWith(['/order'], {
      queryParams: { symbol: 'NVDA', side: 'SELL' },
    });
  });
});
