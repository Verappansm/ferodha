import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, map, of, Subject, switchMap, tap, timer } from 'rxjs';
import {
  InstrumentFilters,
  InstrumentQuery,
  InstrumentResponse,
  InstrumentType,
  PaginatedInstrumentsResponse,
  PriceSnapshot,
  TradeApi,
} from '../../api/trade-api';
import { errorMessage } from '../../core/errors/error-message';
import { suggestedLimitPrice } from '../../core/format/limit-price';
import { MoneyPipe } from '../../core/format/money.pipe';

/** How often the prices of the rows on screen are re-read. */
export const PRICE_REFRESH_MS = 15_000;

/** How long typing pauses before the search is sent. */
export const SEARCH_DEBOUNCE_MS = 300;

/** How long a moved price keeps its up or down flash. */
const FLASH_MS = 1_000;

/**
 * The market list (LEAP-015): the tradable instruments, searched by ticker or name and
 * filtered by exchange, sector and type on the server, a page at a time. The filter choices
 * come from the data (GET /instruments/filters). The search and filters live in the URL, so a
 * filtered list can be bookmarked or shared.
 */
@Component({
  selector: 'app-instruments',
  imports: [FormsModule, MoneyPipe, RouterLink],
  templateUrl: './instruments.component.html',
  styleUrls: ['./instruments.component.css'],
})
export class InstrumentsComponent {
  private readonly tradeApi = inject(TradeApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly pageSize = 20;
  readonly currentOffset = signal(0);

  // The page on screen and how many match in all.
  readonly paginatedInstruments = signal<InstrumentResponse[]>([]);
  readonly totalFilteredCount = signal(0);
  readonly isLoading = signal(false);
  readonly hasLoaded = signal(false);
  readonly errorMessage = signal('');

  // Filters
  readonly searchQuery = signal('');
  readonly selectedExchange = signal('');
  readonly selectedSector = signal('');
  readonly selectedType = signal('');

  // The choices, from the data.
  readonly filterOptions = signal<InstrumentFilters>({ exchanges: [], sectors: [], types: [] });
  readonly exchanges = computed(() => this.filterOptions().exchanges);
  readonly sectors = computed(() => this.filterOptions().sectors);
  readonly types = computed(() => this.filterOptions().types);

  readonly hasFilters = computed(
    () =>
      !!(this.searchQuery() || this.selectedExchange() || this.selectedSector() || this.selectedType()),
  );

  readonly currentPageNum = computed(() => Math.floor(this.currentOffset() / this.pageSize) + 1);
  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalFilteredCount() / this.pageSize)),
  );
  readonly hasNextPage = computed(
    () => this.currentOffset() + this.pageSize < this.totalFilteredCount(),
  );
  readonly hasPrevPage = computed(() => this.currentOffset() > 0);
  /** The first and last row numbers on this page, for "1–20 of 95". */
  readonly rangeStart = computed(() =>
    this.totalFilteredCount() === 0 ? 0 : this.currentOffset() + 1,
  );
  readonly rangeEnd = computed(() =>
    Math.min(this.currentOffset() + this.pageSize, this.totalFilteredCount()),
  );

  /** The latest price per symbol, for the rows on screen. */
  readonly prices = signal<ReadonlyMap<string, PriceSnapshot>>(new Map());
  /** Symbols whose price just moved, and which way, for a brief flash. */
  readonly moves = signal<ReadonlyMap<string, 'up' | 'down'>>(new Map());

  /** Each request for a page; only the latest one's answer is shown. */
  private readonly pageRequests = new Subject<{ debounce: boolean }>();

  constructor() {
    this.readFiltersFromUrl();

    this.tradeApi.instrumentFilters().subscribe({
      next: (filters) => this.filterOptions.set(filters),
      error: () => {
        // The list still works without the choices; the filters just stay at "All".
      },
    });

    this.pageRequests
      .pipe(
        switchMap(({ debounce }) =>
          (debounce ? timer(SEARCH_DEBOUNCE_MS) : of(0)).pipe(
            tap(() => {
              this.isLoading.set(true);
              this.errorMessage.set('');
            }),
            switchMap(() =>
              this.tradeApi.getInstruments(this.pageSize, this.currentOffset(), this.query()).pipe(
                map((page): PaginatedInstrumentsResponse | Error => page),
                catchError((error: unknown) => of(error instanceof Error ? error : new Error(errorMessage(error)))),
              ),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        this.isLoading.set(false);
        this.hasLoaded.set(true);
        if (result instanceof Error) {
          this.errorMessage.set('The instruments could not be loaded. Please try again.');
          return;
        }
        this.paginatedInstruments.set(result.instruments);
        this.totalFilteredCount.set(result.total);
        this.loadPrices(result.instruments.map((i) => i.symbol));
      });

    this.loadPage(false);

    // Keep the prices on screen current while the page is open.
    const priceTimer = setInterval(
      () => this.loadPrices(this.paginatedInstruments().map((i) => i.symbol)),
      PRICE_REFRESH_MS,
    );
    inject(DestroyRef).onDestroy(() => clearInterval(priceTimer));
  }

  priceOf(symbol: string): PriceSnapshot | undefined {
    return this.prices().get(symbol);
  }

  /** The search and filters as the API takes them. */
  private query(): InstrumentQuery {
    return {
      search: this.searchQuery() || undefined,
      exchange: this.selectedExchange() || undefined,
      sector: this.selectedSector() || undefined,
      type: (this.selectedType() || undefined) as InstrumentType | undefined,
    };
  }

  private loadPage(debounce: boolean): void {
    this.pageRequests.next({ debounce });
  }

  /** One request for every symbol on screen; a failure keeps the last prices shown. */
  private loadPrices(symbols: string[]): void {
    if (symbols.length === 0) return;
    this.tradeApi.prices(symbols).subscribe({
      next: (prices) => {
        const moved = new Map<string, 'up' | 'down'>();
        this.prices.update((current) => {
          const next = new Map(current);
          for (const price of prices) {
            const before = current.get(price.symbol)?.mid;
            if (before != null && price.mid != null && price.mid !== before) {
              moved.set(price.symbol, price.mid > before ? 'up' : 'down');
            }
            next.set(price.symbol, price);
          }
          return next;
        });
        if (moved.size > 0) {
          this.moves.set(moved);
          setTimeout(() => this.moves.set(new Map()), FLASH_MS);
        }
      },
      error: () => {
        // Prices are a convenience on this page: the list stays usable without them.
      },
    });
  }

  /** The ticket link, with a suggested price (0.02% past the touch) when there is a quote. */
  private ticketParams(symbol: string, side: 'BUY' | 'SELL'): Record<string, string | number> {
    const price = suggestedLimitPrice(this.priceOf(symbol), side);
    return price === null ? { symbol, side } : { symbol, side, price };
  }

  /** A bookmarked or shared link opens with its search and filters applied. */
  private readFiltersFromUrl(): void {
    const params = this.route.snapshot.queryParamMap;
    this.searchQuery.set(params.get('q') ?? '');
    this.selectedExchange.set(params.get('exchange') ?? '');
    this.selectedSector.set(params.get('sector') ?? '');
    this.selectedType.set(params.get('type') ?? '');
  }

  /** Writes the search and filters into the URL without adding a history entry per keystroke. */
  private writeFiltersToUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.searchQuery() || null,
        exchange: this.selectedExchange() || null,
        sector: this.selectedSector() || null,
        type: this.selectedType() || null,
      },
      replaceUrl: true,
    });
  }

  /** Typing: back to the first page, after a pause. */
  onSearchChange(): void {
    this.currentOffset.set(0);
    this.writeFiltersToUrl();
    this.loadPage(true);
  }

  /** A filter choice: back to the first page, at once. */
  onFilterChange(): void {
    this.currentOffset.set(0);
    this.writeFiltersToUrl();
    this.loadPage(false);
  }

  onExchangeChange(): void {
    this.onFilterChange();
  }

  onSectorChange(): void {
    this.onFilterChange();
  }

  onTypeChange(): void {
    this.onFilterChange();
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.selectedExchange.set('');
    this.selectedSector.set('');
    this.selectedType.set('');
    this.onFilterChange();
  }

  nextPage(): void {
    if (this.hasNextPage()) {
      this.currentOffset.update((offset) => offset + this.pageSize);
      this.loadPage(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  prevPage(): void {
    if (this.hasPrevPage()) {
      this.currentOffset.update((offset) => Math.max(0, offset - this.pageSize));
      this.loadPage(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  buyInstrument(symbol: string): void {
    this.router.navigate(['/order'], { queryParams: this.ticketParams(symbol, 'BUY') });
  }

  sellInstrument(symbol: string): void {
    this.router.navigate(['/order'], { queryParams: this.ticketParams(symbol, 'SELL') });
  }

  viewDetails(symbol: string): void {
    this.router.navigate(['/instruments', symbol]);
  }
}
