import { Component, computed, inject, signal, effect, OnDestroy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, debounceTime, distinctUntilChanged, of, Subject, switchMap } from 'rxjs';
import { Router } from '@angular/router';
import { formatNumber } from '../../core/format/number-format';
import { PreferencesStore } from '../../core/preferences/preferences.store';
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
  CreatePriceAlertRequest,
  UpdatePriceAlertRequest,
  PriceAlertResponse,
} from '../../api/trade-api';
import { errorMessage } from '../../core/errors/error-message';
import {
  CellStyleModule,
  ClientSideRowModelModule,
  ColDef,
  GridApi,
  GridReadyEvent,
  ModuleRegistry,
  NumberEditorModule,
  RowClassParams,
  RowStyleModule,
  SelectEditorModule,
  TextEditorModule,
  ValueFormatterParams,
  ICellRendererParams,
  CellValueChangedEvent,
  themeQuartz,
} from 'ag-grid-community';
import { AgGridAngular } from 'ag-grid-angular';

// ag-grid 33 and later render nothing until the features a grid uses are registered.
ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  CellStyleModule,
  RowStyleModule,
  NumberEditorModule,
  SelectEditorModule,
  TextEditorModule,
]);

/**
 * The grid's look, from the app's own tokens, so light and dark mode and the
 * rest of the app stay in step with no separate grid stylesheet.
 */
export const WATCHLIST_GRID_THEME = themeQuartz.withParams({
  backgroundColor: 'var(--surface)',
  foregroundColor: 'var(--ink-900)',
  textColor: 'var(--ink-900)',
  subtleTextColor: 'var(--ink-500)',
  headerBackgroundColor: 'var(--ink-100)',
  headerTextColor: 'var(--ink-500)',
  headerFontSize: 11.5,
  headerFontWeight: 600,
  borderColor: 'var(--ink-200)',
  rowBorder: { color: 'var(--ink-200)' },
  rowHoverColor: 'var(--row-hover)',
  oddRowBackgroundColor: 'var(--surface)',
  selectedRowBackgroundColor: 'var(--brand-100)',
  accentColor: 'var(--brand-600)',
  fontFamily: 'inherit',
  fontSize: 13.5,
  wrapperBorder: false,
  wrapperBorderRadius: 0,
  headerRowBorder: { color: 'var(--ink-200)' },
  columnBorder: false,
  cellHorizontalPadding: 14,
});

/** An alert threshold: a positive price with at most two decimals (LEAP-007). */
export function isValidAlertPrice(price: number | null): price is number {
  if (price === null || !Number.isFinite(price) || price <= 0) return false;
  return Math.abs(price * 100 - Math.round(price * 100)) < 1e-6;
}

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
  alertPrice: number | null;
  alertDirection: string | null;
  /** ACTIVE, TRIGGERED or CANCELLED; null when no alert was ever set (LEAP-007). */
  alertStatus: string | null;
  alertTriggeredAt: string | null;
  alertTriggeredPrice: number | null;
}

@Component({
  selector: 'app-watchlist',
  imports: [FormsModule, AgGridAngular],
  templateUrl: './watchlist.component.html',
  styleUrls: ['./watchlist.component.css'],
})
export class WatchlistComponent implements OnDestroy {
  private readonly session = inject(Session);
  private readonly preferences = inject(PreferencesStore);
  private readonly tradeApi = inject(TradeApi);
  private readonly router = inject(Router);

  protected readonly gridTheme = WATCHLIST_GRID_THEME;
  /** Each keystroke in the search box; only the latest search's answer is shown. */
  private readonly searchTerms = new Subject<string>();

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

  // Price Alert modal
  readonly showCreateAlertModal = signal(false);
  readonly createAlertItemId = signal<string | null>(null);
  readonly createAlertSymbol = signal<string>('');
  readonly createAlertName = signal<string>('');
  readonly createAlertPrice = signal<number | null>(null);
  readonly createAlertDirection = signal<'ABOVE' | 'BELOW'>('ABOVE');
  readonly isCreatingAlert = signal(false);
  readonly createAlertError = signal('');
  readonly createAlertAvailableItems = signal<WatchlistRow[]>([]);

  // Edit alert state
  readonly editingAlertItemId = signal<string | null>(null);

  // Notifications
  readonly notifications = signal<Array<{id: number; message: string; type: 'success' | 'error' | 'info'}>>([]);
  private notificationCounter = 0;

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
    const isEditing = this.isEditing();
    const editingAlertId = this.editingAlertItemId();

    const defs: any[] = [
      {
        field: 'symbol',
        headerName: 'Ticker',
        width: 96,
        minWidth: 90,
        cellClass: 'wl-symbol',
      },
      {
        field: 'name',
        headerName: 'Instrument Name',
        width: 180,
        minWidth: 140,
        flex: 1,
        cellClass: 'wl-name',
      },
      {
        field: 'lastPrice',
        headerName: 'Price',
        width: 130,
        minWidth: 110,
        type: 'rightAligned',
        valueFormatter: (p: ValueFormatterParams<WatchlistRow, number>) => {
          // Get real-time price from price map
          const snapshot = this.priceMap().get(p.data?.symbol || '');
          const displayPrice = snapshot?.mid ?? p.value;
          if (!displayPrice) return '—';
          const text = formatNumber(displayPrice, this.preferences.numberFormat(), '1.2-2');
          // A price the feed has not refreshed recently is never shown as live.
          return snapshot?.stale ? `${text} (stale)` : text;
        },
        cellClass: (params: any) =>
          this.priceMap().get(params.data?.symbol || '')?.stale ? 'ag-right-aligned-cell wl-num wl-stale' : 'ag-right-aligned-cell wl-num',
      },
      {
        field: 'dayChangePercent',
        headerName: 'Day change',
        width: 120,
        minWidth: 110,
        type: 'rightAligned',
        valueFormatter: (p: ValueFormatterParams<WatchlistRow, number>) => {
          const pct = p.value;
          if (pct == null || !p.data?.lastPrice) return '—';
          if (pct === 0) return '0.00%';
          // A sign as well as a colour, so the direction never rests on colour alone.
          return `${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(2)}%`;
        },
        cellClass: (params: any) => {
          const pct = params.value as number;
          if (!pct || !params.data?.lastPrice) return 'ag-right-aligned-cell wl-num';
          return pct > 0 ? 'ag-right-aligned-cell wl-num wl-up' : 'ag-right-aligned-cell wl-num wl-down';
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
        field: 'alertPrice',
        headerName: 'Alert at',
        width: 120,
        minWidth: 110,
        type: 'rightAligned',
        valueFormatter: (p: ValueFormatterParams<WatchlistRow, number | null>) => {
          return p.value != null
            ? formatNumber(p.value, this.preferences.numberFormat(), '1.2-2')
            : '—';
        },
        editable: isEditing,
        cellEditor: 'agNumberCellEditor',
        cellEditorParams: {
          precision: 2,
          step: 0.01,
          min: 0,
        },
        cellClass: (params: any) =>
          params.data?.alertStatus === 'CANCELLED' ? 'ag-right-aligned-cell wl-num wl-muted' : 'ag-right-aligned-cell wl-num',
        onCellValueChanged: (event: CellValueChangedEvent<WatchlistRow>) => {
          this.onAlertPriceChanged(event);
        },
      },
      {
        field: 'alertDirection',
        headerName: 'Alert When',
        width: 120,
        minWidth: 110,
        valueFormatter: (p: ValueFormatterParams<WatchlistRow, string | null>) => {
          if (!p.value) return '—';
          return p.value === 'ABOVE' ? 'Goes Above' : 'Goes Below';
        },
        editable: isEditing,
        cellEditor: 'agSelectCellEditor',
        cellEditorParams: {
          values: ['ABOVE', 'BELOW'],
        },
        onCellValueChanged: (event: CellValueChangedEvent<WatchlistRow>) => {
          this.onAlertDirectionChanged(event);
        },
      },
      {
        field: 'alertStatus',
        headerName: 'Alert state',
        width: 150,
        minWidth: 130,
        // The state the server records, as a word (not colour alone).
        cellRenderer: (params: ICellRendererParams<WatchlistRow>) => {
          const row = params.data;
          const span = document.createElement('span');
          if (!row?.alertStatus) {
            span.textContent = '—';
            span.className = 'wl-muted';
            return span;
          }
          span.className = `wl-state wl-state-${row.alertStatus.toLowerCase()}`;
          span.textContent =
            row.alertStatus === 'TRIGGERED'
              ? 'Triggered'
              : row.alertStatus === 'ACTIVE'
                ? 'Active'
                : 'Cancelled';
          if (row.alertStatus === 'TRIGGERED' && row.alertTriggeredAt) {
            const at = new Date(row.alertTriggeredAt);
            const price =
              row.alertTriggeredPrice != null
                ? ` at ${formatNumber(row.alertTriggeredPrice, this.preferences.numberFormat(), '1.2-2')}`
                : '';
            span.title = `Triggered${price}, ${at.toLocaleString()}`;
          }
          return span;
        },
      },
      {
        field: 'itemId',
        headerName: '',
        width: 110,
        minWidth: 110,
        maxWidth: 110,
        suppressAutoSize: true,
        suppressMovable: true,
        hide: !isEditing,
        cellRenderer: (params: ICellRendererParams<WatchlistRow>) => {
          const button = document.createElement('button');
          button.className = 'wl-btn wl-btn-danger';
          button.textContent = 'Remove';
          button.title = `Remove ${params.data?.symbol ?? 'item'} from this watchlist`;
          button.type = 'button';
          button.onclick = (e) => {
            e.stopPropagation();
            this.deleteRow(params.data!.itemId);
          };
          return button;
        },
      },
      {
        field: 'itemId',
        headerName: '',
        width: 160,
        minWidth: 160,
        maxWidth: 160,
        suppressAutoSize: true,
        suppressMovable: true,
        hide: isEditing,
        cellRenderer: (params: ICellRendererParams<WatchlistRow>) => {
          const container = document.createElement('div');
          container.className = 'wl-actions';

          // Edit alert button
          const editBtn = document.createElement('button');
          editBtn.className = 'wl-btn';
          const active = params.data?.alertStatus === 'ACTIVE';
          editBtn.textContent = active ? 'Edit alert' : 'Set alert';
          editBtn.title = active ? 'Change the price alert' : 'Set a price alert';
          editBtn.type = 'button';
          editBtn.onclick = (e) => {
            e.stopPropagation();
            this.openCreateAlertModal(params.data!);
          };

          // Delete alert button (only show if alert exists)
          if (params.data?.alertStatus === 'ACTIVE') {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'wl-btn wl-btn-danger';
            deleteBtn.textContent = 'Cancel';
            deleteBtn.title = 'Cancel the price alert';
            deleteBtn.type = 'button';
            deleteBtn.onclick = (e) => {
              e.stopPropagation();
              this.deletePriceAlert(params.data!.itemId);
            };
            container.appendChild(deleteBtn);
          }

          container.appendChild(editBtn);
          return container;
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
    this.searchTerms
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((query) =>
          this.tradeApi
            .getInstruments(100, 0, query)
            .pipe(catchError(() => of({ instruments: [] as InstrumentResponse[], total: 0 }))),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((response) => {
        // A selection made while the search was in flight wins over its answer.
        if (!this.selectedInstrument()) this.searchResults.set(response.instruments);
        this.isSearching.set(false);
      });

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
          alertPrice: i.alertPrice ?? null,
          alertDirection: i.alertDirection ?? null,
          alertStatus: i.alertStatus ?? null,
          alertTriggeredAt: i.alertTriggeredAt ?? null,
          alertTriggeredPrice: i.alertTriggeredPrice ?? null,
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
    this.selectedInstrument.set(null);
    this.showAddDropdown.set(false);
    this.searchTerms.next(query);
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
    this.editingAlertItemId.set(null);
  }

  // ===== Price Alert Methods =====

  openCreateAlertModal(row: WatchlistRow): void {
    this.createAlertItemId.set(row.itemId);
    this.createAlertSymbol.set(row.symbol);
    this.createAlertName.set(row.name);
    this.createAlertPrice.set(row.alertPrice);
    this.createAlertDirection.set((row.alertDirection as 'ABOVE' | 'BELOW') || 'ABOVE');
    this.createAlertError.set('');
    this.showCreateAlertModal.set(true);
  }

  openCreateAlertModalFromSection(): void {
    // Populate available items from current watchlist and open modal for user to select
    const rows = this.editRows();
    if (rows.length > 0) {
      this.createAlertAvailableItems.set(rows);
      this.createAlertItemId.set(null);
      this.createAlertSymbol.set('');
      this.createAlertName.set('');
      this.createAlertPrice.set(null);
      this.createAlertDirection.set('ABOVE');
      this.createAlertError.set('');
      this.showCreateAlertModal.set(true);
    }
  }

  closeCreateAlertModal(): void {
    this.showCreateAlertModal.set(false);
    this.createAlertItemId.set(null);
    this.createAlertSymbol.set('');
    this.createAlertName.set('');
    this.createAlertPrice.set(null);
    this.createAlertDirection.set('ABOVE');
    this.createAlertError.set('');
    this.createAlertAvailableItems.set([]);
  }

  onAlertInstrumentChange(itemId: string): void {
    const item = this.createAlertAvailableItems().find(i => i.itemId === itemId);
    if (item) {
      this.createAlertSymbol.set(item.symbol);
      this.createAlertName.set(item.name);
      // Pre-fill with existing alert values if any
      this.createAlertPrice.set(item.alertPrice);
      this.createAlertDirection.set((item.alertDirection as 'ABOVE' | 'BELOW') || 'ABOVE');
    }
  }

  isCreateAlertValid(): boolean {
    const isEditing = this.createAlertItemId() !== null;
    // For editing, itemId is already set. For creating, we need available items loaded.
    return this.createAlertItemId() !== null &&
           isValidAlertPrice(this.createAlertPrice()) &&
           this.createAlertDirection() !== null &&
           (isEditing || this.createAlertAvailableItems().length > 0);
  }

  createPriceAlert(): void {
    const itemId = this.createAlertItemId();
    const watchlistId = this.selectedWatchlistId();
    const alertPrice = this.createAlertPrice();
    const alertDirection = this.createAlertDirection();

    if (!itemId || !watchlistId || !alertDirection) {
      this.createAlertError.set('Choose an instrument and a direction.');
      return;
    }
    if (!isValidAlertPrice(alertPrice)) {
      this.createAlertError.set('Enter a price above zero with at most two decimal places.');
      return;
    }

    this.isCreatingAlert.set(true);
    this.createAlertError.set('');

    const request: CreatePriceAlertRequest = { itemId, alertPrice, alertDirection };
    this.tradeApi.createPriceAlert(watchlistId, itemId, request).subscribe({
      next: (response) => {
        this.isCreatingAlert.set(false);
        this.closeCreateAlertModal();
        this.showNotification(
          `Alert set: ${response.symbol} ${alertDirection === 'ABOVE' ? 'above' : 'below'} ${alertPrice.toFixed(2)}`,
          'success',
        );
        // Reload items to get updated alert info
        this.loadItems(watchlistId);
      },
      error: (err) => {
        this.isCreatingAlert.set(false);
        this.createAlertError.set(errorMessage(err));
      },
    });
  }

  onAlertPriceChanged(event: CellValueChangedEvent<WatchlistRow>): void {
    const row = event.data;
    const newPrice = event.newValue as number | null;
    const watchlistId = this.selectedWatchlistId();

    if (!watchlistId || !row) return;

    // Validate: if price is set but direction is not, don't save yet
    if (newPrice !== null && !isValidAlertPrice(newPrice)) {
      this.showNotification('An alert price must be above zero, with at most two decimals', 'error');
      this.loadItems(watchlistId); // Revert
      return;
    }

    // If both price and direction are null, delete the alert
    if (newPrice === null && !row.alertDirection) {
      this.deletePriceAlert(row.itemId);
      return;
    }

    // If price is null but direction exists, clear both
    if (newPrice === null) {
      this.deletePriceAlert(row.itemId);
      return;
    }

    // Update the alert
    this.updatePriceAlert(row.itemId, newPrice, row.alertDirection);
  }

  onAlertDirectionChanged(event: CellValueChangedEvent<WatchlistRow>): void {
    const row = event.data;
    const newDirection = event.newValue as string | null;
    const watchlistId = this.selectedWatchlistId();

    if (!watchlistId || !row) return;

    // If direction is null but price exists, clear both
    if (!newDirection) {
      this.deletePriceAlert(row.itemId);
      return;
    }

    // Update the alert
    this.updatePriceAlert(row.itemId, row.alertPrice, newDirection);
  }

  private updatePriceAlert(itemId: string, alertPrice: number | null, alertDirection: string | null): void {
    const watchlistId = this.selectedWatchlistId();
    if (!watchlistId) return;

    // Type assertion for alertDirection to match the expected type
    const request: UpdatePriceAlertRequest = {
      alertPrice,
      alertDirection: alertDirection as 'ABOVE' | 'BELOW' | null
    };
    this.tradeApi.updatePriceAlert(watchlistId, itemId, request).subscribe({
      next: (response) => {
        const directionText = alertDirection === 'ABOVE' ? 'above' : 'below';
        const priceText = alertPrice !== null ? alertPrice.toFixed(2) : 'removed';
        this.showNotification(`Price alert updated for ${response.symbol}: ${directionText} ${priceText}`, 'success');
        this.loadItems(watchlistId);
      },
      error: (err) => {
        this.showNotification(`Failed to update alert: ${errorMessage(err)}`, 'error');
        this.loadItems(watchlistId); // Revert on error
      },
    });
  }

  deletePriceAlert(itemId: string): void {
    const watchlistId = this.selectedWatchlistId();
    if (!watchlistId) return;

    this.tradeApi.deletePriceAlert(watchlistId, itemId).subscribe({
      next: () => {
        this.showNotification('Price alert cancelled', 'success');
        this.loadItems(watchlistId);
      },
      error: (err) => {
        this.showNotification(`Failed to remove alert: ${errorMessage(err)}`, 'error');
        this.loadItems(watchlistId);
      },
    });
  }

  // ===== Notification System =====

  private showNotification(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    const id = ++this.notificationCounter;
    this.notifications.update(list => [...list, { id, message, type }]);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      this.notifications.update(list => list.filter(n => n.id !== id));
    }, 5000);
  }

  dismissNotification(id: number): void {
    this.notifications.update(list => list.filter(n => n.id !== id));
  }

  // ===== Helpers =====

  /** An arrow function: the grid calls it without binding `this`. */
  readonly getRowClass = (_params: RowClassParams<WatchlistRow>): string =>
    this.isEditing() ? 'wl-row-editing' : '';

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
      this.color = 'var(--ink-400)';
    } else {
      this.color = last >= first ? 'var(--positive)' : 'var(--negative)';
    }
  }
}
