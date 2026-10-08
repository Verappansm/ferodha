import { Component, inject, OnInit, signal, WritableSignal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BalanceResponse, OrderHistoryEntry, TradeApi } from '../../api/trade-api';
import { PnlResponse, PortfolioApi, PricedPosition } from '../../api/portfolio-api';
import { errorMessage } from '../../core/errors/error-message';
import { Session } from '../../core/session/session';
import { LOADING, PanelState } from './panel-state';
import { CashPanelComponent } from './components/cash-panel.component';
import { PnlPanelComponent } from './components/pnl-panel.component';
import { RecentOrdersPanelComponent } from './components/recent-orders-panel.component';
import { TopPositionsPanelComponent } from './components/top-positions-panel.component';

/** How many orders and positions the dashboard shows. */
export const PANEL_ROWS = 5;

/**
 * The client dashboard (LEAP-014): cash from the balance route, today's P&L
 * and the largest positions from the portfolio routes (LEAP-009, so the two
 * screens never disagree), and the latest orders from order history. Each
 * panel loads on its own, so one failing request never blanks the others.
 */
@Component({
  selector: 'app-dashboard',
  imports: [
    DatePipe,
    RouterLink,
    CashPanelComponent,
    PnlPanelComponent,
    RecentOrdersPanelComponent,
    TopPositionsPanelComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  private readonly session = inject(Session);
  private readonly tradeApi = inject(TradeApi);
  private readonly portfolioApi = inject(PortfolioApi);

  readonly cash = signal<PanelState<BalanceResponse>>(LOADING);
  readonly pnl = signal<PanelState<PnlResponse>>(LOADING);
  readonly orders = signal<PanelState<OrderHistoryEntry[]>>(LOADING);
  readonly positions = signal<PanelState<PricedPosition[]>>(LOADING);
  readonly lastUpdated = signal<Date | null>(null);

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    this.loadCash();
    this.loadPnl();
    this.loadOrders();
    this.loadPositions();
    this.lastUpdated.set(new Date());
  }

  loadCash(): void {
    this.load(this.cash, (accountId) => this.tradeApi.balance(accountId));
  }

  /** Realised P&L booked today (UTC, as the server books it) plus unrealised as at now. */
  loadPnl(): void {
    const today = new Date().toISOString().slice(0, 10);
    this.load(this.pnl, (accountId) =>
      this.portfolioApi.pnl(accountId, { from: today, to: today }),
    );
  }

  loadOrders(): void {
    this.load(this.orders, (accountId) =>
      this.tradeApi
        .orderHistory(accountId)
        .pipe(
          map((orders) =>
            [...orders]
              .sort((a, b) => Date.parse(b.createdOn) - Date.parse(a.createdOn))
              .slice(0, PANEL_ROWS),
          ),
        ),
    );
  }

  /** Largest first by market value; a holding without a price sorts last. */
  loadPositions(): void {
    this.load(this.positions, (accountId) =>
      this.portfolioApi
        .positions(accountId)
        .pipe(
          map((positions) =>
            [...positions]
              .sort((a, b) => (b.marketValue ?? -Infinity) - (a.marketValue ?? -Infinity))
              .slice(0, PANEL_ROWS),
          ),
        ),
    );
  }

  private load<T>(
    state: WritableSignal<PanelState<T>>,
    request: (accountId: number) => Observable<T>,
  ): void {
    const accountId = this.session.accountId();
    if (accountId === null) return;
    state.set(LOADING);
    request(accountId).subscribe({
      next: (data) => state.set({ loading: false, error: null, data }),
      error: (error: unknown) =>
        state.set({ loading: false, error: errorMessage(error), data: null }),
    });
  }
}
