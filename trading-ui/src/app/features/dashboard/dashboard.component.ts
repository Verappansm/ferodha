import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PortfolioService } from '../../services/portfolio.service';
import { OrderService } from '../../services/order.service';
import { Session } from '../../core/session/session';
import { CashPanelComponent } from './components/cash-panel.component';
import { PnlPanelComponent } from './components/pnl-panel.component';
import { RecentOrdersPanelComponent } from './components/recent-orders-panel.component';
import { TopPositionsPanelComponent } from './components/top-positions-panel.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    CashPanelComponent,
    PnlPanelComponent,
    RecentOrdersPanelComponent,
    TopPositionsPanelComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
})
export class DashboardComponent implements OnInit {
  private session = inject(Session);
  private portfolioService = inject(PortfolioService);
  private orderService = inject(OrderService);

  accountId = computed(() => this.session.accountId());
  cashLoading = signal(false);
  cashError = signal<string | null>(null);
  cashBalance = signal(0);

  pnlLoading = signal(false);
  pnlError = signal<string | null>(null);
  pnlData = signal<any>(null);

  ordersLoading = signal(false);
  ordersError = signal<string | null>(null);
  orders = signal<any[]>([]);

  positionsLoading = signal(false);
  positionsError = signal<string | null>(null);
  positions = signal<any[]>([]);

  lastUpdate = computed(() => new Date());

  ngOnInit() {
    this.initializeDashboard();
  }

  private initializeDashboard() {
    const acctId = this.accountId();
    if (acctId) {
      this.loadAllData();
    }
  }

  private loadAllData() {
    this.reloadCash();
    this.reloadPnl();
    this.reloadOrders();
    this.reloadPositions();
  }

  reloadCash() {
    const acctId = this.accountId();
    if (!acctId) return;
    this.cashLoading.set(true);
    this.cashError.set(null);
    this.portfolioService.getPortfolioSummary(acctId).subscribe({
      next: (summary: any) => {
        this.cashBalance.set(summary.cashBalance);
        this.cashLoading.set(false);
      },
      error: (err: any) => {
        this.cashError.set('Failed to load cash balance');
        this.cashLoading.set(false);
      },
    });
  }

  reloadPnl() {
    const acctId = this.accountId();
    if (!acctId) return;
    this.pnlLoading.set(true);
    this.pnlError.set(null);
    this.portfolioService.getPnl(acctId).subscribe({
      next: (pnl: any) => {
        this.pnlData.set(pnl);
        this.pnlLoading.set(false);
      },
      error: (err: any) => {
        this.pnlError.set('Failed to load P&L');
        this.pnlLoading.set(false);
      },
    });
  }

  reloadOrders() {
    const acctId = this.accountId();
    if (!acctId) return;
    this.ordersLoading.set(true);
    this.ordersError.set(null);
    this.orderService.getRecentOrders(acctId, 5).subscribe({
      next: (orders: any) => {
        this.orders.set(orders);
        this.ordersLoading.set(false);
      },
      error: (err: any) => {
        this.ordersError.set('Failed to load orders');
        this.ordersLoading.set(false);
      },
    });
  }

  reloadPositions() {
    const acctId = this.accountId();
    if (!acctId) return;
    this.positionsLoading.set(true);
    this.positionsError.set(null);
    this.portfolioService.getTopPositions(acctId, 5).subscribe({
      next: (positions: any) => {
        this.positions.set(positions);
        this.positionsLoading.set(false);
      },
      error: (err: any) => {
        this.positionsError.set('Failed to load positions');
        this.positionsLoading.set(false);
      },
    });
  }

  isEmptyState(): boolean {
    return !this.cashBalance() && !this.pnlData() && this.orders().length === 0;
  }
}
