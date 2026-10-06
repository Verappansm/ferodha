import { Component, computed, inject, signal, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Session } from '../../core/session/session';
import {
  TradeApi,
  WatchlistResponse,
  CreateWatchlistRequest,
  BulkAddWatchlistItemsRequest,
  IntradayPricePoint,
  InstrumentResponse,
  PriceHistory,
  PricePoint,
  PriceSnapshot,
} from '../../api/trade-api';
import { errorMessage } from '../../core/errors/error-message';
import {
  ColDef,
  GridApi,
  GridReadyEvent,
  RowClassParams,
  ValueFormatterParams,
  ICellRendererParams,
} from 'ag-grid-community';
import { AgGridAngular } from 'ag-grid-angular';

const WATCHLIST_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
];

interface WatchlistRow {
  itemId: string;
  symbol: string;
  name: string;
  lastPrice: number;
  dayChange: number;
  dayChangePercent: number;
  intradayData: IntradayPricePoint[];
  displayOrder: number;
}

@Component({
  selector: 'app-watchlist',
  standalone: true,
  imports: [CommonModule, FormsModule, AgGridAngular],
  templateUrl: './watchlist.component.html',
  styleUrls: ['./watchlist.component.css'],
})
export class WatchlistComponent implements OnDestroy {
  private readonly session = inject(Session);
  private readonly tradeApi = inject(TradeApi);
  private readonly router = inject(Router);

  // Watchlists
  readonly watchlists = signal<WatchlistResponse[]>([]);
  readonly selectedWatchlistId = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly error = signal('');

  // Search - Spotify style: type → see results → click to select → show "Add to playlist"
  readonly searchQuery = signal('');
  readonly searchResults = signal<InstrumentResponse[]>([]);
  readonly isSearching = signal(false);
  readonly selectedInstrument = signal<InstrumentResponse | null>(null);
  readonly showAddDropdown = signal(false);
  readonly selectedWatchlistIds = signal<Set<string>>(new Set());
  readonly showCreateFromSearch = signal(false);
  readonly newWatchlistNameFromSearch = signal('');

  // Create watchlist modal
  readonly showCreateModal = signal(false);
  readonly newWatchlistName = signal('');
  readonly isCreating = signal(false);

  // Edit mode
  readonly isEditing = signal(false);
  readonly editRows = signal<WatchlistRow[]>([]);

  // Auto-refresh prices (every 15 seconds, similar to instruments component)
  private priceRefreshInterval: ReturnType<typeof setInterval> | null = null;
  private readonly PRICE_REFRESH_MS = 15_000;

  readonly selectedWatchlist = computed(() => {
    const id = this.selectedWatchlistId();
    if (!id) return null;
    return this.watchlists().find(w => w.watchlistId === id) ?? null;
  });

  readonly selectedWatchlistName = computed(() => this.selectedWatchlist()?.name ?? '');

  readonly selectedWatchlistColor = computed(() => {
    const id = this.selectedWatchlistId();
    if (!id) return WATCHLIST_COLORS[0];
    const idx = this.watchlists().findIndex(w => w.watchlistId === id);
    return WATCHLIST_COLORS[Math.max(idx, 0) % WATCHLIST_COLORS.length];
  });

  readonly filteredSearchResults = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return [];
    return this.searchResults().filter(i =>
      i.symbol.toLowerCase().includes(query) || i.name.toLowerCase().includes(query)
    );
  });

  readonly hasItems = computed(() => this.editRows().length > 0);

  /** Real-time prices keyed by symbol - matches instruments component pattern */
  readonly priceMap = signal<ReadonlyMap<string, PriceSnapshot>>(new Map());

  readonly columnDefs = computed<ColDef<WatchlistRow>[]>(() => {
    const defs: any[] = [
      {
        field: 'symbol',
        headerName: 'Ticker',
        width: 80,
        minWidth: 80,
        cellStyle: { fontWeight: 600, color: '#111827' },
      },
      {
        field: 'name',
        headerName: 'Instrument Name',
        width: 180,
        minWidth: 140,
        flex: 1,
        cellStyle: { color: '#374151' },
      },
      {
        field: 'lastPrice',
        headerName: 'Price',
        width: 100,
        minWidth: 95,
        valueFormatter: (p: ValueFormatterParams<WatchlistRow, number>) => {
          // Get real-time price from price map
          const realPrice = this.priceMap().get(p.data?.symbol || '')?.mid;
          const displayPrice = realPrice ?? p.value;
          return displayPrice ? `$${displayPrice.toFixed(2)}` : '—';
        },
        cellClass: (params: any) => {
          const changePercent = params.data?.dayChangePercent as number;
          if (!changePercent || changePercent === 0) {
            return 'price-cell-neutral';
          }
          return changePercent > 0 ? 'price-cell-positive' : 'price-cell-negative';
        },
      },
      {
        field: 'intradayData',
        headerName: 'Today',
        width: 130,
        minWidth: 110,
        cellRenderer: SparklineRenderer,
        cellStyle: { padding: '4px 8px' },
      },
      {
        field: 'itemId',
        headerName: '',
        width: 85,
        minWidth: 85,
        maxWidth: 85,
        suppressAutoSize: true,
        suppressMovable: true,
        cellStyle: { 
          textAlign: 'center', 
          padding: '0 8px',
        },
        hide: !this.isEditing(),
        cellRenderer: (params: ICellRendererParams<WatchlistRow>) => {
          const button = document.createElement('button');
          button.className = 'delete-row-btn';
          button.innerHTML = 'Delete';
          button.title = 'Delete item';
          button.type = 'button';
          button.style.whiteSpace = 'nowrap';
          button.style.fontSize = '12px';
          button.onclick = (e) => {
            e.stopPropagation();
            this.deleteRow(params.data!.itemId);
          };
          return button;
        },
      },
    ];
    return defs;
  });

  readonly defaultColDef = signal<ColDef>({
    resizable: true,
    sortable: false,
    suppressMovable: true,
    autoHeight: false,
  });

  constructor() {
    effect(() => {
      const accountId = this.session.accountId();
      if (accountId) {
        this.loadWatchlists();
      } else {
        this.watchlists.set([]);
        this.selectedWatchlistId.set(null);
      }
    });
  }

  ngOnDestroy(): void {
    this.stopPriceRefresh();
  }

  // ===== Data Loading =====

  private loadWatchlists(): void {
    this.isLoading.set(true);
    this.error.set('');

    this.tradeApi.getWatchlists().subscribe({
      next: (watchlists) => {
        this.watchlists.set(watchlists);
        this.isLoading.set(false);
        if (watchlists.length > 0 && !this.selectedWatchlistId()) {
          this.selectWatchlist(watchlists[0].watchlistId);
        } else if (watchlists.length === 0) {
          this.selectedWatchlistId.set(null);
        }
      },
      error: (err) => {
        this.isLoading.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }

  selectWatchlist(watchlistId: string): void {
    this.selectedWatchlistId.set(watchlistId);
    this.isEditing.set(false);
    this.loadItems(watchlistId);
  }

  private loadItems(watchlistId: string): void {
    this.tradeApi.getWatchlistItems(watchlistId).subscribe({
      next: (items) => {
        const rows: WatchlistRow[] = items.map(i => ({
          itemId: i.itemId,
          symbol: i.symbol,
          name: i.name,
          lastPrice: i.lastPrice,
          dayChange: i.dayChange,
          dayChangePercent: i.dayChangePercent,
          intradayData: i.intradayData,
          displayOrder: i.displayOrder,
        }));
        this.editRows.set(rows);
        // Fetch real prices and intraday data
        this.enrichItemsWithPricesAndChart(rows);
        // Start auto-refresh for prices
        this.startPriceRefresh(watchlistId);
      },
      error: (err) => {
        this.error.set(errorMessage(err));
      },
    });
  }

  private startPriceRefresh(watchlistId: string): void {
    this.stopPriceRefresh();
    // Immediately fetch prices and chart data
    this.loadPricesAndChart(watchlistId);
    // Then refresh every 15 seconds
    this.priceRefreshInterval = setInterval(() => {
      if (!this.isEditing()) {
        this.loadPricesAndChart(watchlistId);
      }
    }, this.PRICE_REFRESH_MS);
  }

  private stopPriceRefresh(): void {
    if (this.priceRefreshInterval) {
      clearInterval(this.priceRefreshInterval);
      this.priceRefreshInterval = null;
    }
  }

  private enrichItemsWithPricesAndChart(rows: WatchlistRow[]): void {
    if (rows.length === 0) return;
    
    const symbols = rows.map((r: WatchlistRow) => r.symbol);
    
    // Load real-time prices for display (matching instruments component pattern)
    this.loadRealTimePrices(symbols);
    
    // Fetch intraday chart data for each symbol
    symbols.forEach((symbol: string) => {
      this.tradeApi.history(symbol, PriceHistory.RangeEnum._1D).subscribe({
        next: (history: PriceHistory) => {
          const intradayPoints = history.points.map((point: PricePoint) => ({
            timestamp: point.time,
            price: point.close || point.open || 0,
          }));
          const row = rows.find((r: WatchlistRow) => r.symbol === symbol);
          if (row) {
            row.intradayData = intradayPoints;
          }
          this.editRows.set([...rows]);
        },
        error: () => {
          // Chart data is optional, don't fail if not available
        },
      });
    });
  }

  /** Fetch real-time prices for all symbols - matches instruments component pattern */
  private loadRealTimePrices(symbols: string[]): void {
    if (symbols.length === 0) return;
    
    this.tradeApi.prices(symbols).subscribe({
      next: (prices) => {
        this.priceMap.update((current) => {
          const next = new Map(current);
          for (const price of prices) {
            next.set(price.symbol, price);
          }
          return next;
        });
      },
      error: () => {
        // Prices are optional, keep current values
      },
    });
  }

  private loadPricesAndChart(watchlistId: string): void {
    const symbols = this.editRows().map((r: WatchlistRow) => r.symbol);
    if (symbols.length === 0) return;

    // Fetch real-time prices using bulk API (same as instruments component)
    this.loadRealTimePrices(symbols);
  }

  // ===== Search (Spotify-style) =====

  onSearchInput(): void {
    const query = this.searchQuery().trim();
    if (query.length < 1) {
      this.searchResults.set([]);
      this.selectedInstrument.set(null);
      this.showAddDropdown.set(false);
      return;
    }
    this.isSearching.set(true);
    this.tradeApi.getInstruments(100, 0, query).subscribe({
      next: (response) => {
        this.searchResults.set(response.instruments);
        this.isSearching.set(false);
      },
      error: () => {
        this.isSearching.set(false);
        this.searchResults.set([]);
      },
    });
  }

  selectInstrument(instrument: InstrumentResponse): void {
    this.selectedInstrument.set(instrument);
    this.searchQuery.set(`${instrument.symbol} - ${instrument.name}`);
    this.searchResults.set([]);
    this.showAddDropdown.set(true);
    this.selectedWatchlistIds.set(new Set());
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.selectedInstrument.set(null);
    this.showAddDropdown.set(false);
    this.selectedWatchlistIds.set(new Set());
  }

  toggleWatchlistSelection(watchlistId: string): void {
    const current = new Set(this.selectedWatchlistIds());
    if (current.has(watchlistId)) {
      current.delete(watchlistId);
    } else {
      current.add(watchlistId);
    }
    this.selectedWatchlistIds.set(current);
  }

  isWatchlistSelected(watchlistId: string): boolean {
    return this.selectedWatchlistIds().has(watchlistId);
  }

  createWatchlistFromSearch(): void {
    const name = this.newWatchlistNameFromSearch().trim();
    if (!name || !this.selectedInstrument()) return;

    const request: CreateWatchlistRequest = { name };
    this.tradeApi.createWatchlist(request).subscribe({
      next: (watchlist) => {
        this.watchlists.update(list => [...list, watchlist]);
        this.newWatchlistNameFromSearch.set('');
        this.showCreateFromSearch.set(false);
        this.addSymbolToWatchlists(this.selectedInstrument()!.symbol, [watchlist.watchlistId]);
      },
      error: (err) => {
        this.error.set(errorMessage(err));
      },
    });
  }

  confirmAddToWatchlists(): void {
    const instrument = this.selectedInstrument();
    const ids = Array.from(this.selectedWatchlistIds());
    if (!instrument || ids.length === 0) {
      this.showAddDropdown.set(false);
      return;
    }
    this.addSymbolToWatchlists(instrument.symbol, ids);
  }

  private addSymbolToWatchlists(symbol: string, watchlistIds: string[]): void {
    const request: BulkAddWatchlistItemsRequest = { symbol, watchlistIds };
    this.tradeApi.addWatchlistItemsBulk(request).subscribe({
      next: () => {
        this.showAddDropdown.set(false);
        this.clearSearch();
        
        // Always reload watchlist sidebar counts
        this.loadWatchlists();
        
        // If the item was added to the currently selected watchlist, also reload the grid
        const currentWatchlistId = this.selectedWatchlistId();
        if (currentWatchlistId && watchlistIds.includes(currentWatchlistId)) {
          this.loadItems(currentWatchlistId);
        }
      },
      error: (err) => {
        this.error.set(errorMessage(err));
      },
    });
  }

  // ===== Create Watchlist =====

  openCreateModal(): void {
    this.showCreateModal.set(true);
    this.newWatchlistName.set('');
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
    this.newWatchlistName.set('');
  }

  createWatchlist(): void {
    const name = this.newWatchlistName().trim();
    if (!name) return;

    this.isCreating.set(true);
    const request: CreateWatchlistRequest = { name };
    this.tradeApi.createWatchlist(request).subscribe({
      next: (watchlist) => {
        this.watchlists.update(list => [...list, watchlist]);
        this.isCreating.set(false);
        this.closeCreateModal();
        this.selectWatchlist(watchlist.watchlistId);
      },
      error: (err) => {
        this.isCreating.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }

  // ===== Edit Mode =====

  toggleEdit(): void {
    // Entering edit mode
    if (!this.isEditing()) {
      this.isEditing.set(true);
    }
  }

  onGridReady(params: GridReadyEvent<WatchlistRow>): void {
    this.gridApi = params.api;
  }

  private gridApi: GridApi<WatchlistRow> | null = null;

  deleteRow(itemId: string): void {
    const id = this.selectedWatchlistId();
    if (!id) return;

    // Remove from local state immediately for UI feedback
    this.editRows.update(rows => rows.filter(r => r.itemId !== itemId));
    
    // Delete from backend
    this.tradeApi.removeWatchlistItem(id, itemId).subscribe({
      next: () => {
        // Item successfully deleted - update sidebar counts
        this.loadWatchlists();
      },
      error: (err) => {
        this.error.set(`Failed to delete item: ${errorMessage(err)}`);
        // Reload items to restore the deleted item since the API call failed
        this.loadItems(id);
      },
    });
  }

  submitEdits(): void {
    // Exit edit mode (all deletions already persisted to backend in deleteRow())
    this.isEditing.set(false);
  }

  // ===== Helpers =====

  private getPriceColor(changePercent: number): string {
    if (!changePercent || changePercent === 0) {
      return '#111827'; // ink-900
    }
    return changePercent > 0 ? '#22c55e' : '#ef4444'; // positive: green, negative: red
  }

  getRowClass(params: RowClassParams<WatchlistRow>): string {
    if (this.isEditing()) {
      return 'ag-row-editing';
    }
    return '';
  }

  getWatchlistColor(watchlistId: string): string {
    const idx = this.watchlists().findIndex(w => w.watchlistId === watchlistId);
    return WATCHLIST_COLORS[Math.max(idx, 0) % WATCHLIST_COLORS.length];
  }

  navigateToInstrument(symbol: string): void {
    void this.router.navigate(['/instruments', symbol]);
  }

  navigateToOrder(symbol: string, side: 'BUY' | 'SELL'): void {
    void this.router.navigate(['/order'], { queryParams: { symbol, side } });
  }
}

@Component({
  selector: 'app-sparkline-renderer',
  standalone: true,
  template: `
    <svg [attr.width]="width" [attr.height]="height" class="sparkline">
      <polyline
        [attr.points]="points"
        fill="none"
        [attr.stroke]="color"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `,
  styles: [`
    .sparkline {
      display: block;
    }
  `],
})
export class SparklineRenderer {
  width = 120;
  height = 32;
  points = '';
  color = 'var(--ink-400)';

  agInit(params: ICellRendererParams<WatchlistRow, IntradayPricePoint[]>): void {
    const data: IntradayPricePoint[] = params.value ?? [];
    if (data.length < 2) {
      this.points = '';
      return;
    }

    const prices = data.map(d => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;

    const padding = 2;
    const w = this.width - padding * 2;
    const h = this.height - padding * 2;

    this.points = data.map((d, i) => {
      const x = padding + (i / (data.length - 1)) * w;
      const y = padding + (1 - (d.price - min) / range) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    const first = prices[0];
    const last = prices.at(-1);
    if (!last) {
      this.color = 'var(--neutral)';
    } else {
      this.color = last >= first ? 'var(--positive)' : 'var(--negative)';
    }
  }
}