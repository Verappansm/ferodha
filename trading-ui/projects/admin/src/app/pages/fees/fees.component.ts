import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminApi, FeeInstrument, FeeSummary, FeeUser } from '../../api/admin-api';
import { adminErrorMessage } from '../../core/errors/admin-error-message';
import { PagerComponent } from '../../shared/pager.component';

const PAGE_SIZE = 25;
type Tab = 'user' | 'instrument';
type Range = '7d' | '30d' | 'month' | 'all' | 'custom';

/** A UTC calendar date, the way the fees routes read one. */
function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The commission the platform has taken: the total, this month, and who and
 * what it came from. Per-user rows carry the account's own currency and USD;
 * everything else is in USD (INR converted at the fixed 90 to the dollar the
 * executor settles at).
 */
@Component({
  selector: 'adm-fees',
  imports: [DecimalPipe, ReactiveFormsModule, PagerComponent],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Fees</h1>
          <p>
            Commission taken on filled customer orders, by customer or by instrument. Amounts are in
            USD; INR is converted at 90 to the dollar.
          </p>
        </div>
        <button type="button" class="btn btn-secondary" (click)="reload()">Refresh</button>
      </header>

      @if (summaryError()) {
        <p class="notice notice-error" role="alert">{{ summaryError() }}</p>
      }
      @if (summary(); as s) {
        <section class="tiles" aria-label="Fee totals">
          <div class="tile" data-testid="fees-total">
            <div class="tile-label">Total fees (USD)</div>
            <div class="tile-value">{{ s.totalFees | number: '1.2-2' }}</div>
          </div>
          <div class="tile" data-testid="fees-month">
            <div class="tile-label">This month (USD)</div>
            <div class="tile-value">{{ s.feesThisMonth | number: '1.2-2' }}</div>
          </div>
          <div class="tile">
            <div class="tile-label">Orders charged</div>
            <div class="tile-value">{{ s.feeOrders }}</div>
          </div>
        </section>
        @if (s.byCurrency.length > 1) {
          <p class="muted" data-testid="fees-by-currency">
            Charged in:
            @for (c of s.byCurrency; track c.currency; let last = $last) {
              {{ c.fees | number: '1.2-2' }} {{ c.currency }}{{ last ? '' : ' · ' }}
            }
          </p>
        }
        @if (s.partial) {
          <p class="notice notice-error" role="status">
            Some fees are in a currency that cannot be converted and are left out of the USD totals.
          </p>
        }
      }

      <div class="tabs" role="tablist" aria-label="Fees by">
        <button
          type="button"
          role="tab"
          class="tab"
          [class.active]="tab() === 'user'"
          [attr.aria-selected]="tab() === 'user'"
          data-testid="fees-tab-user"
          (click)="select('user')"
        >
          By user
        </button>
        <button
          type="button"
          role="tab"
          class="tab"
          [class.active]="tab() === 'instrument'"
          [attr.aria-selected]="tab() === 'instrument'"
          data-testid="fees-tab-instrument"
          (click)="select('instrument')"
        >
          By instrument
        </button>
      </div>

      <section class="card">
        <form class="filters" [formGroup]="filters" (ngSubmit)="apply()">
          @if (tab() === 'user') {
            <div class="field grow">
              <label class="field-label" for="fq">Customer</label>
              <input id="fq" class="input" formControlName="q" placeholder="Name or email" />
            </div>
          }
          <div class="field">
            <label class="field-label" for="ffrom">From</label>
            <input id="ffrom" class="input" type="date" formControlName="from" />
          </div>
          <div class="field">
            <label class="field-label" for="fto">To</label>
            <input id="fto" class="input" type="date" formControlName="to" />
          </div>
          <button type="submit" class="btn btn-primary">Apply</button>
          <button type="button" class="btn btn-secondary" (click)="clear()">Clear</button>
          <div class="segmented range" role="group" aria-label="Quick range">
            @for (r of ranges; track r.id) {
              <button
                type="button"
                [attr.aria-pressed]="range() === r.id"
                [attr.data-testid]="'fees-range-' + r.id"
                (click)="quick(r.id)"
              >
                {{ r.label }}
              </button>
            }
          </div>
        </form>

        @if (error()) {
          <p class="notice notice-error" role="alert">{{ error() }}</p>
        }

        @if (tab() === 'user') {
          @if (loading() && users().length === 0) {
            <p class="state">Loading…</p>
          } @else if (users().length === 0) {
            <p class="state" data-testid="fees-empty">No fees in this period.</p>
          } @else {
            <div class="table-wrap">
              <table data-testid="fees-user-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Account</th>
                    <th class="num">Orders</th>
                    <th class="num">Fees (own currency)</th>
                    <th class="num">Fees (USD)</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  @for (u of users(); track u.accountId) {
                    <tr data-testid="fees-user-row">
                      <td>
                        <div class="who-cell">
                          <span class="avatar" aria-hidden="true">{{ initials(u.name) }}</span>
                          <span class="cell-stack"
                            ><strong>{{ u.name }}</strong
                            ><small>{{ u.email }}</small></span
                          >
                        </div>
                      </td>
                      <td class="mono">#{{ u.accountId }}</td>
                      <td class="num">{{ u.orders }}</td>
                      <td class="num">{{ u.fees | number: '1.2-2' }} {{ u.currency }}</td>
                      <td class="num">
                        {{ u.feesUsd == null ? '—' : (u.feesUsd | number: '1.2-2') }}
                      </td>
                      <td>
                        <div class="share">
                          <span class="share-bar"
                            ><i [style.width.%]="userShare(u)" data-testid="fees-user-bar"></i
                          ></span>
                        </div>
                      </td>
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
        } @else {
          @if (loading() && instruments().length === 0) {
            <p class="state">Loading…</p>
          } @else if (instruments().length === 0) {
            <p class="state" data-testid="fees-empty">No fees in this period.</p>
          } @else {
            <div class="table-wrap">
              <table data-testid="fees-instrument-table">
                <thead>
                  <tr>
                    <th>Instrument</th>
                    <th class="num">Orders</th>
                    <th class="num">Fees (USD)</th>
                    <th>Share of fees</th>
                  </tr>
                </thead>
                <tbody>
                  @for (i of instruments(); track i.symbol) {
                    <tr data-testid="fees-instrument-row">
                      <td>
                        <strong class="mono">{{ i.symbol }}</strong
                        ><br /><span class="muted">{{ i.name }}</span>
                      </td>
                      <td class="num">{{ i.orders }}</td>
                      <td class="num">{{ i.feesUsd | number: '1.2-2' }}</td>
                      <td>
                        <div class="share">
                          <span class="share-bar"><i [style.width.%]="share(i)"></i></span>
                          <span class="muted">{{ share(i) | number: '1.0-1' }}%</span>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
      </section>
    </div>
  `,
  styles: `
    .range {
      margin-left: auto;
    }
  `,
})
export class FeesComponent {
  private readonly api = inject(AdminApi);

  readonly pageSize = PAGE_SIZE;
  readonly ranges: { id: Exclude<Range, 'custom'>; label: string }[] = [
    { id: '7d', label: '7 days' },
    { id: '30d', label: '30 days' },
    { id: 'month', label: 'This month' },
    { id: 'all', label: 'All time' },
  ];
  /** Which quick range the dates match; custom once they are typed. */
  readonly range = signal<Range>('all');
  readonly filters = inject(NonNullableFormBuilder).group({ q: [''], from: [''], to: [''] });

  readonly tab = signal<Tab>('user');
  readonly summary = signal<FeeSummary | null>(null);
  readonly summaryError = signal('');
  readonly users = signal<FeeUser[]>([]);
  readonly instruments = signal<FeeInstrument[]>([]);
  readonly page = signal(0);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');
  private readonly instrumentTotal = computed(() =>
    this.instruments().reduce((sum, i) => sum + i.feesUsd, 0),
  );

  constructor() {
    void this.loadSummary();
    void this.load();
  }

  select(tab: Tab): void {
    if (this.tab() === tab) return;
    this.tab.set(tab);
    this.page.set(0);
    void this.load();
  }

  /** Fills the dates for a quick range (UTC days, inclusive) and reloads. */
  quick(range: Exclude<Range, 'custom'>): void {
    const today = new Date();
    const day = (offset: number) => isoDay(new Date(today.getTime() - offset * 86_400_000));
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const dates: Record<Exclude<Range, 'custom'>, { from: string; to: string }> = {
      '7d': { from: day(6), to: day(0) },
      '30d': { from: day(29), to: day(0) },
      month: { from: isoDay(first), to: day(0) },
      all: { from: '', to: '' },
    };
    this.filters.patchValue(dates[range]);
    this.range.set(range);
    this.error.set('');
    this.page.set(0);
    void this.load();
  }

  initials(name: string): string {
    return (
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join('') || '?'
    );
  }

  /** This customer's part of the largest payer's fees, for the bar. */
  userShare(u: FeeUser): number {
    const top = Math.max(0, ...this.users().map((x) => x.feesUsd ?? 0));
    return top > 0 ? ((u.feesUsd ?? 0) / top) * 100 : 0;
  }

  apply(): void {
    this.range.set('custom');
    const { from, to } = this.filters.getRawValue();
    if (from && to && from > to) {
      this.error.set('The "from" date must be on or before the "to" date.');
      return;
    }
    this.page.set(0);
    void this.load();
  }

  clear(): void {
    this.filters.reset();
    this.range.set('all');
    this.page.set(0);
    void this.load();
  }

  reload(): void {
    void this.loadSummary();
    void this.load();
  }

  goTo(page: number): void {
    this.page.set(page);
    void this.load();
  }

  /** This instrument's part of all the fees shown. */
  share(i: FeeInstrument): number {
    const total = this.instrumentTotal();
    return total > 0 ? (i.feesUsd / total) * 100 : 0;
  }

  private async loadSummary(): Promise<void> {
    this.summaryError.set('');
    try {
      this.summary.set(await firstValueFrom(this.api.feeSummary()));
    } catch (e) {
      this.summaryError.set(adminErrorMessage(e));
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    const f = this.filters.getRawValue();
    const range = { from: f.from || undefined, to: f.to || undefined };
    try {
      if (this.tab() === 'user') {
        const result = await firstValueFrom(
          this.api.feesByUser({ ...range, q: f.q.trim() }, { page: this.page(), size: PAGE_SIZE }),
        );
        this.users.set(result.items);
        this.total.set(result.totalItems);
      } else {
        this.instruments.set(await firstValueFrom(this.api.feesByInstrument(range)));
      }
    } catch (e) {
      this.error.set(adminErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
