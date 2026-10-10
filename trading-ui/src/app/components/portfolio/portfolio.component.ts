import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MoneyPipe } from '../../core/format/money.pipe';
import { RouterLink } from '@angular/router';
import {
  PnlResponse,
  PortfolioApi,
  PortfolioSummary,
  PricedPosition,
} from '../../api/portfolio-api';
import { errorMessage } from '../../core/errors/error-message';
import { pnlDirection, pnlSign, pnlWord } from '../../core/format/pnl';
import { Session } from '../../core/session/session';

export type SortKey = 'symbol' | 'value' | 'pnl';

/**
 * The portfolio screen (LEAP-009): totals including cash, every holding
 * priced, and realised and unrealised P&L, from contracts/portfolio-api.yaml.
 * Summary, holdings and P&L load separately, so one failure leaves the
 * others on screen.
 */
@Component({
  selector: 'app-portfolio',
  imports: [DatePipe, MoneyPipe, RouterLink],
  templateUrl: './portfolio.component.html',
  styleUrl: './portfolio.component.css',
})
export class PortfolioComponent implements OnInit {
  private readonly session = inject(Session);
  private readonly portfolioApi = inject(PortfolioApi);

  readonly summary = signal<PortfolioSummary | null>(null);
  readonly summaryError = signal<string | null>(null);
  readonly holdings = signal<PricedPosition[] | null>(null);
  readonly holdingsError = signal<string | null>(null);
  readonly pnl = signal<PnlResponse | null>(null);
  readonly pnlError = signal<string | null>(null);

  readonly sortBy = signal<SortKey>('value');
  readonly descending = signal(true);

  /** Unpriced holdings always sort last, whichever way the column runs. */
  readonly sortedHoldings = computed(() => {
    const key = this.sortBy();
    const direction = this.descending() ? -1 : 1;
    return [...(this.holdings() ?? [])].sort((a, b) => {
      if (key === 'symbol') return direction * a.symbol.localeCompare(b.symbol);
      const left = key === 'value' ? a.marketValue : a.unrealisedPnl;
      const right = key === 'value' ? b.marketValue : b.unrealisedPnl;
      if (left == null || right == null) return (left == null ? 1 : 0) - (right == null ? 1 : 0);
      return direction * (left - right);
    });
  });

  protected readonly direction = pnlDirection;
  protected readonly sign = pnlSign;
  protected readonly word = pnlWord;
  protected readonly abs = (value: number | null | undefined) => Math.abs(value ?? 0);

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    const accountId = this.session.accountId();
    if (accountId === null) return;
    this.summaryError.set(null);
    this.holdingsError.set(null);
    this.pnlError.set(null);
    this.portfolioApi.summary(accountId).subscribe({
      next: (summary) => this.summary.set(summary),
      error: (error: unknown) => this.summaryError.set(errorMessage(error)),
    });
    this.portfolioApi.positions(accountId).subscribe({
      next: (holdings) => this.holdings.set(holdings),
      error: (error: unknown) => this.holdingsError.set(errorMessage(error)),
    });
    this.portfolioApi.pnl(accountId).subscribe({
      next: (pnl) => this.pnl.set(pnl),
      error: (error: unknown) => this.pnlError.set(errorMessage(error)),
    });
  }

  sort(key: SortKey): void {
    if (this.sortBy() === key) {
      this.descending.update((value) => !value);
    } else {
      this.sortBy.set(key);
      this.descending.set(key !== 'symbol');
    }
  }

  ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (this.sortBy() !== key) return 'none';
    return this.descending() ? 'descending' : 'ascending';
  }
}
