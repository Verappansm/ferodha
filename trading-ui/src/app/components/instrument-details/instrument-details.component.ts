import {
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { MoneyPipe } from '../../core/format/money.pipe';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ChartRange,
  InstrumentQuote,
  InstrumentResponse,
  PricePoint,
  TradeApi,
} from '../../api/trade-api';
import { errorMessage } from '../../core/errors/error-message';
import { pnlDirection, pnlSign, pnlWord } from '../../core/format/pnl';
import { suggestedLimitPrice } from '../../core/format/limit-price';
import { CHART_FACTORY, DrawnChart } from './price-chart';

export const RANGES: { value: ChartRange; label: string }[] = [
  { value: '1D', label: '1 day' },
  { value: '1W', label: '1 week' },
  { value: '1M', label: '1 month' },
  { value: '6M', label: '6 months' },
  { value: '1Y', label: '1 year' },
];

/** How often the quote is re-read while the page is open. */
export const QUOTE_REFRESH_MS = 15_000;

/**
 * The instrument page (LEAP-016): the latest quote with its time and
 * staleness, key statistics, a price chart over a chosen range with a text
 * summary and a data table beside it, and Buy and Sell into the order ticket.
 * Every figure comes from the Trade REST API; the browser never calls
 * Fauxnance. Fauxnance has no news feed, so there is no news panel.
 */
@Component({
  selector: 'app-instrument-details',
  imports: [DatePipe, MoneyPipe, RouterLink],
  templateUrl: './instrument-details.component.html',
  styleUrl: './instrument-details.component.css',
})
export class InstrumentDetailsComponent implements OnInit {
  private readonly tradeApi = inject(TradeApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly drawChart = inject(CHART_FACTORY);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly ranges = RANGES;
  protected readonly direction = pnlDirection;
  protected readonly sign = pnlSign;
  protected readonly word = pnlWord;
  protected readonly abs = Math.abs;

  readonly symbol = signal('');
  readonly instrument = signal<InstrumentResponse | null>(null);
  readonly instrumentError = signal<string | null>(null);
  readonly quote = signal<InstrumentQuote | null>(null);
  readonly quoteError = signal<string | null>(null);
  readonly range = signal<ChartRange>('1M');
  readonly points = signal<PricePoint[] | null>(null);
  readonly historyError = signal<string | null>(null);
  readonly showTable = signal(false);

  readonly rangeLabel = computed(() => RANGES.find((r) => r.value === this.range())?.label ?? '');

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('chartCanvas');
  private chart: DrawnChart | null = null;

  /** Lowest low, highest high and the change from first to last close. */
  readonly summary = computed(() => {
    const points = this.points();
    if (!points || points.length === 0) return null;
    const first = points[0].close;
    const last = points.at(-1)?.close;
    return {
      low: Math.min(...points.map((p) => p.low)),
      high: Math.max(...points.map((p) => p.high)),
      first,
      last,
      change: last ? last - first : 0,
      changePercent: first === 0 || !last ? null : ((last - first) / first) * 100,
    };
  });

  constructor() {
    // Redraw whenever the points change and the canvas is on the page.
    effect(() => {
      const points = this.points();
      const canvas = this.canvas()?.nativeElement;
      this.chart?.destroy();
      this.chart = null;
      if (!canvas || !points || points.length === 0) return;
      const first = points[0].close;
      const last = points.at(-1)?.close;
      const isUp = last ? last >= first : false;
      this.chart = this.drawChart(canvas, {
        labels: points.map((p) => this.label(p.time)),
        closes: points.map((p) => p.close),
        colours: {
          line: isUp ? cssVar('--positive') : cssVar('--negative'),
          fill: isUp ? cssVar('--positive-bg') : cssVar('--negative-bg'),
          grid: cssVar('--ink-200'),
          text: cssVar('--ink-500'),
        },
      });
    });
    this.destroyRef.onDestroy(() => this.chart?.destroy());
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const symbol = params.get('symbol') ?? '';
      this.symbol.set(symbol);
      this.loadInstrument();
      this.loadQuote();
      this.loadHistory();
    });
    const timer = setInterval(() => this.loadQuote(), QUOTE_REFRESH_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  /** A new range reloads the chart only, never the quote. */
  selectRange(range: ChartRange): void {
    if (range === this.range()) return;
    this.range.set(range);
    this.loadHistory();
  }

  /**
   * Opens the order ticket pre-filled with the symbol, the side and a
   * suggested limit price (0.02% past the touch) when there is a quote.
   */
  trade(side: 'BUY' | 'SELL'): void {
    const price = suggestedLimitPrice(this.quote(), side);
    void this.router.navigate(['/order'], {
      queryParams:
        price === null ? { symbol: this.symbol(), side } : { symbol: this.symbol(), side, price },
    });
  }

  label(time: string): string {
    const date = new Date(time);
    return this.range() === '1D'
      ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleDateString([], { day: 'numeric', month: 'short', year: '2-digit' });
  }

  loadQuote(): void {
    this.tradeApi.quote(this.symbol()).subscribe({
      next: (quote) => {
        this.quote.set(quote);
        this.quoteError.set(null);
      },
      error: (error: unknown) => this.quoteError.set(errorMessage(error)),
    });
  }

  loadHistory(): void {
    this.points.set(null);
    this.historyError.set(null);
    this.tradeApi.history(this.symbol(), this.range()).subscribe({
      next: (history) => this.points.set(history.points),
      error: (error: unknown) => this.historyError.set(errorMessage(error)),
    });
  }

  private loadInstrument(): void {
    this.instrumentError.set(null);
    this.tradeApi.instrument(this.symbol()).subscribe({
      next: (instrument) => this.instrument.set(instrument),
      error: (error: unknown) => this.instrumentError.set(errorMessage(error)),
    });
  }
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#4f46e5';
}
