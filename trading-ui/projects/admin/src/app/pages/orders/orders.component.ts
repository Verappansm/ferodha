import { Component, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminApi, AdminOrder, AdminOrderStatus } from '../../api/admin-api';
import { adminErrorMessage } from '../../core/errors/admin-error-message';
import { PagerComponent } from '../../shared/pager.component';
import { StatusPillComponent } from '../../shared/status-pill.component';

const PAGE_SIZE = 50;

/** LEAP-023: every order on the platform, newest first, read-only. */
@Component({
  selector: 'adm-orders',
  imports: [DatePipe, DecimalPipe, ReactiveFormsModule, PagerComponent, StatusPillComponent],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>All orders</h1>
          <p>Every order on the platform, across accounts, newest first.</p>
        </div>
        <button type="button" class="btn btn-secondary" (click)="load()">Refresh</button>
      </header>

      @if (error()) {
        <p class="notice notice-error" role="alert">{{ error() }}</p>
      }

      <section class="card">
        <form class="filters" [formGroup]="filters" (ngSubmit)="search()">
          <div class="field">
            <label class="field-label" for="accountId">Account #</label>
            <input id="accountId" class="input" type="number" min="1" formControlName="accountId" />
          </div>
          <div class="field">
            <label class="field-label" for="symbol">Symbol</label>
            <input id="symbol" class="input" formControlName="symbol" maxlength="20" />
          </div>
          <div class="field">
            <label class="field-label" for="status">Status</label>
            <select id="status" class="input" formControlName="status">
              <option value="">Any</option>
              @for (s of statuses; track s) {
                <option [value]="s">{{ s }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="from">From</label>
            <input id="from" class="input" type="date" formControlName="from" />
          </div>
          <div class="field">
            <label class="field-label" for="to">To</label>
            <input id="to" class="input" type="date" formControlName="to" />
          </div>
          <button type="submit" class="btn btn-primary">Apply</button>
        </form>

        @if (loading() && orders().length === 0) {
          <p class="state">Loading orders…</p>
        } @else if (orders().length === 0) {
          <p class="state">No orders match.</p>
        } @else {
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Placed</th>
                  <th>Order</th>
                  <th>Account</th>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th class="num">Qty (filled)</th>
                  <th class="num">Limit</th>
                  <th class="num">Executed</th>
                  <th>Status</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                @for (o of orders(); track o.orderId) {
                  <tr data-testid="order-row">
                    <td>{{ o.createdOn | date: 'd MMM y, HH:mm:ss' }}</td>
                    <td class="mono" [attr.title]="o.orderId">{{ shortId(o.orderId) }}</td>
                    <td>
                      <div class="cell-stack">
                        <span>#{{ o.accountId }}</span>
                        <small>{{ o.ownerEmail }}</small>
                      </div>
                    </td>
                    <td class="mono">{{ o.symbol }}</td>
                    <td>{{ o.side }}</td>
                    <td class="num">
                      {{ o.quantity | number }}
                      @if (o.filledQuantity != null && o.filledQuantity !== o.quantity) {
                        <span class="muted">({{ o.filledQuantity | number }})</span>
                      }
                    </td>
                    <td class="num">{{ o.price | number: '1.2-2' }}</td>
                    <td class="num">
                      {{ o.executedPrice != null ? (o.executedPrice | number: '1.2-2') : '—' }}
                    </td>
                    <td><adm-status-pill [status]="o.status" /></td>
                    <td class="muted">{{ o.source ?? '—' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <adm-pager
            [page]="page()"
            [size]="pageSize"
            [total]="total()"
            (pageChange)="goTo($event)"
          />
        }
      </section>
    </div>
  `,
})
export class OrdersComponent {
  private readonly api = inject(AdminApi);

  readonly statuses = Object.values(AdminOrderStatus);
  readonly pageSize = PAGE_SIZE;
  readonly filters = inject(NonNullableFormBuilder).group({
    accountId: [''],
    symbol: [''],
    status: [''],
    from: [''],
    to: [''],
  });

  readonly orders = signal<AdminOrder[]>([]);
  readonly page = signal(0);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');

  constructor() {
    void this.load();
  }

  search(): void {
    this.page.set(0);
    void this.load();
  }

  goTo(page: number): void {
    this.page.set(page);
    void this.load();
  }

  shortId(orderId: string): string {
    return orderId.length > 16 ? `${orderId.slice(0, 12)}…` : orderId;
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    const f = this.filters.getRawValue();
    const accountId = Number(f.accountId);
    try {
      const result = await firstValueFrom(
        this.api.listOrders(
          {
            accountId: Number.isInteger(accountId) && accountId > 0 ? accountId : undefined,
            symbol: f.symbol.trim().toUpperCase(),
            status: (f.status || undefined) as AdminOrderStatus | undefined,
            // Whole days, in the operator's time zone.
            from: f.from ? new Date(`${f.from}T00:00:00`).toISOString() : undefined,
            to: f.to ? new Date(`${f.to}T23:59:59.999`).toISOString() : undefined,
          },
          { page: this.page(), size: PAGE_SIZE },
        ),
      );
      this.orders.set(result.items);
      this.total.set(result.totalItems);
    } catch (e) {
      this.error.set(adminErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
