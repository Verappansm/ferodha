import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { DecimalPipe } from '@angular/common';
import { AdminApi, AdminSummary, AuditEntry, FeeSummary, SystemHealth } from '../../api/admin-api';
import { adminErrorMessage } from '../../core/errors/admin-error-message';
import { InfoTipComponent } from '../../shared/info-tip.component';
import { StatusPillComponent } from '../../shared/status-pill.component';

/** Headline counts, service health and the latest decisions, each loaded independently. */
@Component({
  selector: 'adm-overview',
  imports: [RouterLink, DatePipe, DecimalPipe, InfoTipComponent, StatusPillComponent],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Overview</h1>
          <p>The platform at a glance. Anything needing a decision is highlighted.</p>
        </div>
        <button type="button" class="btn btn-secondary" (click)="load()">Refresh</button>
      </header>

      @if (summaryError()) {
        <p class="notice notice-error" role="alert">{{ summaryError() }}</p>
      }
      @if (summary(); as s) {
        <section class="tiles" aria-label="Headline counts">
          <a
            class="tile"
            routerLink="/account-requests"
            [class.tile-attention]="s.pendingRequests > 0"
            data-testid="tile-pending"
          >
            <div class="tile-label">
              Pending account requests<adm-info-tip
                label="Pending account requests"
                text="New customers waiting for an administrator to open their trading account. They cannot sign in until you approve."
              />
            </div>
            <div class="tile-value">{{ s.pendingRequests }}</div>
          </a>
          <a class="tile" routerLink="/users">
            <div class="tile-label">Active users</div>
            <div class="tile-value">{{ s.activeUsers }}</div>
          </a>
          <a class="tile" routerLink="/users" [class.tile-attention]="s.suspendedUsers > 0">
            <div class="tile-label">Suspended users</div>
            <div class="tile-value">{{ s.suspendedUsers }}</div>
          </a>
          <a class="tile" routerLink="/accounts">
            <div class="tile-label">Active accounts</div>
            <div class="tile-value">{{ s.activeAccounts }}</div>
          </a>
          <a class="tile" routerLink="/orders">
            <div class="tile-label">Orders today</div>
            <div class="tile-value">{{ s.ordersToday }}</div>
          </a>
          <a class="tile" routerLink="/orders">
            <div class="tile-label">Orders in process</div>
            <div class="tile-value">{{ s.ordersWorking }}</div>
          </a>
          <a class="tile" routerLink="/instruments">
            <div class="tile-label">Tradable instruments</div>
            <div class="tile-value">{{ s.tradableInstruments }}</div>
          </a>
          @if (fees(); as f) {
            <a class="tile" routerLink="/fees" data-testid="tile-fees">
              <div class="tile-label">
                Total fees (USD)<adm-info-tip
                  label="Total fees"
                  text="Commission taken on filled customer orders, all time. INR accounts are converted at 90 to the dollar."
                />
              </div>
              <div class="tile-value">{{ f.totalFees | number: '1.2-2' }}</div>
            </a>
            <a class="tile" routerLink="/fees" data-testid="tile-fees-month">
              <div class="tile-label">Fees this month (USD)</div>
              <div class="tile-value">{{ f.feesThisMonth | number: '1.2-2' }}</div>
            </a>
          }
        </section>
      } @else if (!summaryError()) {
        <p class="state">Loading counts…</p>
      }

      <div class="split">
        <section class="card">
          <div class="card-header">
            <h2>Services</h2>
            <a routerLink="/health">Details</a>
          </div>
          @if (healthError()) {
            <p class="state">{{ healthError() }}</p>
          } @else if (health(); as h) {
            <ul class="service-list">
              @for (c of h.components; track c.name) {
                <li>
                  <span>{{ c.name }}</span>
                  <adm-status-pill [status]="c.status" />
                </li>
              }
            </ul>
          } @else {
            <p class="state">Checking…</p>
          }
        </section>

        <section class="card">
          <div class="card-header">
            <h2>Latest decisions</h2>
            <a routerLink="/audit">Audit log</a>
          </div>
          @if (auditError()) {
            <p class="state">{{ auditError() }}</p>
          } @else if (audit().length === 0) {
            <p class="state">No decisions recorded yet.</p>
          } @else {
            <ul class="audit-list">
              @for (entry of audit(); track entry.id) {
                <li>
                  <span class="mono">{{ entry.action }}</span>
                  <span class="muted"
                    >{{ entry.actorName }} · {{ entry.at | date: 'd MMM, HH:mm' }}</span
                  >
                </li>
              }
            </ul>
          }
        </section>
      </div>
    </div>
  `,
  styles: `
    .split {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 20px;
    }
    .service-list,
    .audit-list {
      margin: 0;
      padding: 6px 18px 12px;
      list-style: none;
    }
    .service-list li,
    .audit-list li {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 9px 0;
      border-bottom: 1px solid var(--ink-200);
    }
    .service-list li:last-child,
    .audit-list li:last-child {
      border-bottom: 0;
    }
  `,
})
export class OverviewComponent {
  private readonly api = inject(AdminApi);

  readonly summary = signal<AdminSummary | null>(null);
  readonly summaryError = signal('');
  readonly fees = signal<FeeSummary | null>(null);
  readonly health = signal<SystemHealth | null>(null);
  readonly healthError = signal('');
  readonly audit = signal<AuditEntry[]>([]);
  readonly auditError = signal('');

  constructor() {
    this.load();
  }

  load(): void {
    this.summaryError.set('');
    this.healthError.set('');
    this.auditError.set('');
    firstValueFrom(this.api.summary())
      .then((s) => this.summary.set(s))
      .catch((e) => this.summaryError.set(adminErrorMessage(e)));
    firstValueFrom(this.api.feeSummary())
      .then((f) => this.fees.set(f))
      .catch(() => this.fees.set(null)); // the counts still show; Fees has its own error
    firstValueFrom(this.api.health())
      .then((h) => this.health.set(h))
      .catch((e) => this.healthError.set(adminErrorMessage(e)));
    firstValueFrom(this.api.audit({ page: 0, size: 5 }))
      .then((a) => this.audit.set(a.items))
      .catch((e) => this.auditError.set(adminErrorMessage(e)));
  }
}
