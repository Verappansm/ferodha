import { Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TradeApi, InstrumentResponse, InstrumentType, PriceSnapshot } from '../../api/trade-api';
import { suggestedLimitPrice } from '../../core/format/limit-price';
import { MoneyPipe } from '../../core/format/money.pipe';

/** How often the prices of the rows on screen are re-read. */
export const PRICE_REFRESH_MS = 15_000;

/** How long a moved price keeps its up or down flash. */
const FLASH_MS = 1_000;

/**
 * The market list (LEAP-015): every tradable instrument, searchable by ticker
 * or name and filterable by exchange, sector and type. The search and filters
 * live in the URL, so a filtered list can be bookmarked or shared.
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

  // Pagination
  readonly pageSize = 20;
  readonly currentOffset = signal(0);
  readonly totalCount = signal(0);

  // Data
  readonly allInstruments = signal<InstrumentResponse[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  // Filters
  readonly searchQuery = signal('');
  readonly selectedExchange = signal('');
  readonly selectedSector = signal('');
  readonly selectedType = signal('');

  // Available filter options
  readonly exchanges = computed(() => {
    const exch = new Set(this.allInstruments().map((i) => i.exchange));
    return Array.from(exch).sort();
  });

  readonly sectors = computed(() => {
    const sec = new Set(
      this.allInstruments()
        .filter((i) => i.sector)
        .map((i) => i.sector!),
    );
    return Array.from(sec).sort();
  });

  readonly types = computed(() => {
    const t = new Set(this.allInstruments().map((i) => i.type));
    return Array.from(t).sort();
  });

  // Filtered instruments
  readonly filteredInstruments = computed(() => {
    const query = this.searchQuery().toLowerCase();
    const exchange = this.selectedExchange();
    const sector = this.selectedSector();
    const type = this.selectedType();

    return this.allInstruments().filter((instrument) => {
      // Search by symbol or name
      if (
        query &&
        !instrument.symbol.toLowerCase().includes(query) &&
        !instrument.name.toLowerCase().includes(query)
      ) {
        return false;
      }

      // Filter by exchange
      if (exchange && instrument.exchange !== exchange) {
        return false;
      }

      // Filter by sector
      if (sector && instrument.sector !== sector) {
        return false;
      }

      // Filter by type
      if (type && instrument.type !== type) {
        return false;
      }

      return true;
    });
  });

  // Paginated results from filtered instruments
  readonly paginatedInstruments = computed(() => {
    const filtered = this.filteredInstruments();
    const start = this.currentOffset();
    const end = start + this.pageSize;
    return filtered.slice(start, end);
  });

  readonly totalFilteredCount = computed(() => this.filteredInstruments().length);

  readonly currentPageNum = computed(() => {
    if (this.totalFilteredCount() === 0) return 1;
    return Math.floor(this.currentOffset() / this.pageSize) + 1;
  });

  readonly totalPages = computed(() => {
    if (this.totalFilteredCount() === 0) return 1;
    return Math.ceil(this.totalFilteredCount() / this.pageSize);
  });

  readonly hasNextPage = computed(() => {
    const nextOffset = this.currentOffset() + this.pageSize;
    return nextOffset < this.totalFilteredCount();
  });

  readonly hasPrevPage = computed(() => this.currentOffset() > 0);

  /** The latest price per symbol, for the rows on screen. */
  readonly prices = signal<ReadonlyMap<string, PriceSnapshot>>(new Map());
  /** Symbols whose price just moved, and which way, for a brief flash. */
  readonly moves = signal<ReadonlyMap<string, 'up' | 'down'>>(new Map());
  readonly hasFilters = computed(
    () =>
      !!(this.searchQuery() || this.selectedExchange() || this.selectedSector() || this.selectedType()),
  );

  constructor() {
    this.readFiltersFromUrl();

    // Load all instruments once when component initializes
    this.loadAllInstruments();

    // Price the rows on screen whenever they change (page, search, filters)...
    effect(() => {
      const symbols = this.paginatedInstruments().map((i) => i.symbol);
      untracked(() => this.loadPrices(symbols));
    });
    // ...and keep them current while the page is open.
    const timer = setInterval(
      () => this.loadPrices(this.paginatedInstruments().map((i) => i.symbol)),
      PRICE_REFRESH_MS,
    );
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  priceOf(symbol: string): PriceSnapshot | undefined {
    return this.prices().get(symbol);
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

  private loadAllInstruments(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    // Load all tradable instruments at once for client-side filtering and pagination
    this.tradeApi.getInstruments(1000, 0).subscribe({
      next: (response) => {
        this.allInstruments.set(response.instruments);
        this.totalCount.set(response.total);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set('Failed to load instruments. Please try again.');
        console.error('Error loading instruments:', err);
      },
    });
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

  onSearchChange(): void {
    this.currentOffset.set(0); // Reset to first page
    this.writeFiltersToUrl();
  }

  onExchangeChange(): void {
    this.onSearchChange();
  }

  onSectorChange(): void {
    this.onSearchChange();
  }

  onTypeChange(): void {
    this.onSearchChange();
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.selectedExchange.set('');
    this.selectedSector.set('');
    this.selectedType.set('');
    this.onSearchChange();
  }

  nextPage(): void {
    if (this.hasNextPage()) {
      this.currentOffset.update((offset) => offset + this.pageSize);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  /** The first and last row numbers on this page, for "1–20 of 95". */
  readonly rangeStart = computed(() =>
    this.totalFilteredCount() === 0 ? 0 : this.currentOffset() + 1,
  );
  readonly rangeEnd = computed(() =>
    Math.min(this.currentOffset() + this.pageSize, this.totalFilteredCount()),
  );

  prevPage(): void {
    if (this.hasPrevPage()) {
      this.currentOffset.update((offset) => offset - this.pageSize);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  buyInstrument(symbol: string): void {
    // Navigate to the order ticket with symbol and side pre-filled
    this.router.navigate(['/order'], { queryParams: this.ticketParams(symbol, 'BUY') });
  }

  sellInstrument(symbol: string): void {
    // Navigate to the order ticket with symbol and side pre-filled
    this.router.navigate(['/order'], { queryParams: this.ticketParams(symbol, 'SELL') });
  }

  viewDetails(symbol: string): void {
    // Navigate to instrument details page
    this.router.navigate(['/instruments', symbol]);
  }
}
