import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PortfolioService } from '../../services/portfolio.service';
import { Session } from '../../core/session/session';

interface PortfolioSummary {
  accountId: number;
  baseCurrency: string;
  cashBalance: number;
  marketValue: number;
  costBasis: number;
  unrealisedPnl: number;
  realisedPnl: number;
  totalValue: number;
  positionCount: number;
  partial: boolean;
  priceAsOf: string;
  asOf: string;
}

interface Position {
  symbol: string;
  quantity: number;
  averageCost: number;
  costBasis: number;
  currency: string;
  lastPrice: number;
  marketValue: number;
  unrealisedPnl: number;
  stale: boolean;
  priceAsOf: string;
}

interface PnlData {
  accountId: number;
  baseCurrency: string;
  realisedPnl: number;
  unrealisedPnl: number;
  totalPnl: number;
  asOf: string;
}

@Component({
  selector: 'app-portfolio',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './portfolio.component.html',
  styleUrls: ['./portfolio.component.css'],
})
export class PortfolioComponent implements OnInit {
  private session = inject(Session);
  private portfolioService = inject(PortfolioService);

  accountId = computed(() => this.session.accountId());

  // Summary
  summary = signal<PortfolioSummary | null>(null);
  summaryLoading = signal(false);
  summaryError = signal<string | null>(null);

  // Holdings
  holdings = signal<Position[]>([]);
  holdingsLoading = signal(false);
  holdingsError = signal<string | null>(null);

  // P&L
  pnl = signal<PnlData | null>(null);
  pnlLoading = signal(false);
  pnlError = signal<string | null>(null);

  // UI
  selectedTab = signal<'summary' | 'holdings' | 'pnl'>('holdings');
  sortBy = signal<'symbol' | 'value' | 'pnl'>('value');
  sortDirection = signal<'asc' | 'desc'>('desc');

  sortedHoldings = computed(() => {
    const holdings = this.holdings();
    const sort = this.sortBy();
    const dir = this.sortDirection();

    const sorted = [...holdings].sort((a, b) => {
      let aVal: number, bVal: number;
      if (sort === 'symbol') {
        return dir === 'asc' ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol);
      } else if (sort === 'value') {
        aVal = a.marketValue;
        bVal = b.marketValue;
      } else {
        aVal = a.unrealisedPnl;
        bVal = b.unrealisedPnl;
      }
      return dir === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  });

  ngOnInit() {
    const acctId = this.accountId();
    if (acctId) {
      this.loadAll();
    }
  }

  loadAll() {
    this.loadSummary();
    this.loadHoldings();
    this.loadPnl();
  }

  loadSummary() {
    const acctId = this.accountId();
    if (!acctId) return;
    this.summaryLoading.set(true);
    this.summaryError.set(null);
    this.portfolioService.getPortfolioSummary(acctId).subscribe({
      next: (data) => {
        this.summary.set(data);
        this.summaryLoading.set(false);
      },
      error: (err: any) => {
        this.summaryError.set('Failed to load portfolio summary');
        this.summaryLoading.set(false);
      },
    });
  }

  loadHoldings() {
    const acctId = this.accountId();
    if (!acctId) return;
    this.holdingsLoading.set(true);
    this.holdingsError.set(null);
    this.portfolioService.getPricedPositions(acctId).subscribe({
      next: (data) => {
        this.holdings.set(data);
        this.holdingsLoading.set(false);
      },
      error: (err: any) => {
        this.holdingsError.set('Failed to load holdings');
        this.holdingsLoading.set(false);
      },
    });
  }

  loadPnl() {
    const acctId = this.accountId();
    if (!acctId) return;
    this.pnlLoading.set(true);
    this.pnlError.set(null);
    this.portfolioService.getPnl(acctId).subscribe({
      next: (data) => {
        this.pnl.set(data);
        this.pnlLoading.set(false);
      },
      error: (err: any) => {
        this.pnlError.set('Failed to load P&L');
        this.pnlLoading.set(false);
      },
    });
  }

  setTab(tab: 'summary' | 'holdings' | 'pnl') {
    this.selectedTab.set(tab);
  }

  setSortBy(sort: 'symbol' | 'value' | 'pnl') {
    if (this.sortBy() === sort) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortBy.set(sort);
      this.sortDirection.set('desc');
    }
  }

  getPnlClass(pnl: number): string {
    return pnl > 0 ? 'positive' : pnl < 0 ? 'negative' : 'neutral';
  }

  getSortIcon(by: string): string {
    if (this.sortBy() !== by) return '⇅';
    return this.sortDirection() === 'asc' ? '↑' : '↓';
  }
}
