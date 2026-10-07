import { Component, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AdminApi, AdminInstrument, InstrumentType } from '../../api/admin-api';
import { adminErrorMessage } from '../../core/errors/admin-error-message';
import { PagerComponent } from '../../shared/pager.component';
import { ReasonDialogComponent } from '../../shared/reason-dialog.component';
import { StatusPillComponent } from '../../shared/status-pill.component';

const PAGE_SIZE = 25;
const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.-]{0,19}$/;

/**
 * LEAP-022: which instruments customers can trade. Delisting refuses new
 * orders (INS-404) and hides the instrument from the market list; existing
 * holdings are untouched.
 */
@Component({
  selector: 'adm-instruments',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    PagerComponent,
    ReasonDialogComponent,
    StatusPillComponent,
  ],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Instruments</h1>
          <p>Add, list or delist instruments. Delisting stops new orders; holdings are kept.</p>
        </div>
        <button
          type="button"
          class="btn btn-primary"
          data-testid="instrument-add"
          [disabled]="adding()"
          (click)="openAdd()"
        >
          Add instrument
        </button>
      </header>

      @if (notice()) {
        <p class="notice notice-success" role="status">{{ notice() }}</p>
      }
      @if (error()) {
        <p class="notice notice-error" role="alert">{{ error() }}</p>
      }

      @if (adding()) {
        <section class="card add-card" data-testid="instrument-add-form">
          <form class="add-form" [formGroup]="addForm" (ngSubmit)="add()" novalidate>
            <h2>Add instrument</h2>
            <p class="muted">
              Prices come from the live feed, which can only price a symbol the market-data provider
              knows. An unknown ticker is listed but has no price, and cannot be traded, until it
              does.
            </p>
            <div class="add-grid">
              <div class="field">
                <label class="field-label" for="a-ticker">Ticker</label>
                <input
                  id="a-ticker"
                  class="input mono"
                  formControlName="ticker"
                  placeholder="NEWCO"
                  data-testid="add-ticker"
                  (input)="upper()"
                />
                @if (invalid('ticker')) {
                  <p class="field-error" data-testid="add-ticker-error">
                    Letters, digits, dots or hyphens, up to 20 characters.
                  </p>
                }
              </div>
              <div class="field grow">
                <label class="field-label" for="a-name">Name</label>
                <input id="a-name" class="input" formControlName="name" data-testid="add-name" />
                @if (invalid('name')) {
                  <p class="field-error">Enter the instrument name.</p>
                }
              </div>
              <div class="field">
                <label class="field-label" for="a-exchange">Exchange</label>
                <input
                  id="a-exchange"
                  class="input"
                  formControlName="exchange"
                  placeholder="NASDAQ"
                  data-testid="add-exchange"
                />
                @if (invalid('exchange')) {
                  <p class="field-error">Enter the exchange.</p>
                }
              </div>
              <div class="field">
                <label class="field-label" for="a-currency">Currency</label>
                <input
                  id="a-currency"
                  class="input mono"
                  formControlName="currency"
                  maxlength="3"
                  data-testid="add-currency"
                  (input)="upper()"
                />
                @if (invalid('currency')) {
                  <p class="field-error">Three capital letters, such as USD.</p>
                }
              </div>
              <div class="field">
                <label class="field-label" for="a-type">Type</label>
                <select id="a-type" class="input" formControlName="type" data-testid="add-type">
                  @for (t of types; track t) {
                    <option [value]="t">{{ t }}</option>
                  }
                </select>
              </div>
              <div class="field">
                <label class="field-label" for="a-sector">Sector (optional)</label>
                <input
                  id="a-sector"
                  class="input"
                  formControlName="sector"
                  data-testid="add-sector"
                />
              </div>
            </div>
            <div class="field">
              <label class="field-label" for="a-reason">Reason (recorded in the audit log)</label>
              <input
                id="a-reason"
                class="input"
                formControlName="reason"
                data-testid="add-reason"
              />
              @if (invalid('reason')) {
                <p class="field-error">Give a reason of at least 3 characters.</p>
              }
            </div>
            @if (addError()) {
              <p class="notice notice-error" role="alert" data-testid="add-error">
                {{ addError() }}
              </p>
            }
            <div class="add-actions">
              <button
                type="submit"
                class="btn btn-primary"
                data-testid="add-save"
                [disabled]="saving()"
              >
                {{ saving() ? 'Adding…' : 'Add instrument' }}
              </button>
              <button type="button" class="btn btn-secondary" (click)="closeAdd()">Cancel</button>
            </div>
          </form>
        </section>
      }

      <section class="card">
        <form class="filters" [formGroup]="filters" (ngSubmit)="search()">
          <div class="field grow">
            <label class="field-label" for="q">Search</label>
            <input id="q" class="input" formControlName="q" placeholder="Symbol or name" />
          </div>
          <div class="field">
            <label class="field-label" for="exchange">Exchange</label>
            <input id="exchange" class="input" formControlName="exchange" placeholder="Any" />
          </div>
          <div class="field">
            <label class="field-label" for="type">Type</label>
            <select id="type" class="input" formControlName="type">
              <option value="">Any</option>
              @for (t of types; track t) {
                <option [value]="t">{{ t }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="tradable">Status</label>
            <select id="tradable" class="input" formControlName="tradable">
              <option value="">Any</option>
              <option value="true">Tradable</option>
              <option value="false">Delisted</option>
            </select>
          </div>
          <button type="submit" class="btn btn-primary">Apply</button>
        </form>

        @if (loading() && instruments().length === 0) {
          <p class="state">Loading instruments…</p>
        } @else if (instruments().length === 0) {
          <p class="state">No instruments match.</p>
        } @else {
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Name</th>
                  <th>Exchange</th>
                  <th>Type</th>
                  <th>Sector</th>
                  <th>Status</th>
                  <th>Last change</th>
                  <th><span class="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (i of instruments(); track i.instrumentId) {
                  <tr data-testid="instrument-row">
                    <td class="mono">
                      <strong>{{ i.symbol }}</strong>
                    </td>
                    <td>{{ i.name }}</td>
                    <td>{{ i.exchange }}</td>
                    <td>{{ i.type }}</td>
                    <td>{{ i.sector ?? '—' }}</td>
                    <td><adm-status-pill [status]="i.tradable ? 'TRADABLE' : 'DELISTED'" /></td>
                    <td>
                      @if (i.changedAt) {
                        <span class="muted"
                          >{{ i.changedByName }} · {{ i.changedAt | date: 'd MMM y' }}</span
                        >
                      } @else {
                        <span class="muted">—</span>
                      }
                    </td>
                    <td>
                      <div class="actions">
                        <button
                          type="button"
                          class="btn btn-secondary btn-sm"
                          [disabled]="busy() === i.instrumentId"
                          (click)="toggle(i)"
                        >
                          {{ i.tradable ? 'Delist' : 'List' }}
                        </button>
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
      </section>
    </div>
    <adm-reason-dialog />
  `,
})
export class InstrumentsComponent {
  private readonly api = inject(AdminApi);
  private readonly dialog = viewChild.required(ReasonDialogComponent);

  readonly types = Object.values(InstrumentType);
  readonly addForm = inject(NonNullableFormBuilder).group({
    ticker: ['', [Validators.required, Validators.pattern(TICKER_PATTERN)]],
    name: ['', [Validators.required, Validators.maxLength(150)]],
    exchange: ['', [Validators.required, Validators.maxLength(50)]],
    currency: ['USD', [Validators.required, Validators.pattern(/^[A-Z]{3}$/)]],
    type: [InstrumentType.EQUITY as InstrumentType, Validators.required],
    sector: [''],
    reason: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(500)]],
  });
  readonly adding = signal(false);
  readonly saving = signal(false);
  readonly addError = signal('');
  readonly pageSize = PAGE_SIZE;
  readonly filters = inject(NonNullableFormBuilder).group({
    q: [''],
    exchange: [''],
    type: [''],
    tradable: [''],
  });

  readonly instruments = signal<AdminInstrument[]>([]);
  readonly page = signal(0);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly busy = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  search(): void {
    this.page.set(0);
    void this.load();
  }

  openAdd(): void {
    this.addError.set('');
    this.notice.set('');
    this.adding.set(true);
  }

  closeAdd(): void {
    this.adding.set(false);
    this.addForm.reset({ currency: 'USD', type: InstrumentType.EQUITY });
    this.addError.set('');
  }

  /** Tickers and currencies are capital letters; type them either way. */
  upper(): void {
    const { ticker, currency } = this.addForm.getRawValue();
    this.addForm.patchValue(
      { ticker: ticker.toUpperCase(), currency: currency.toUpperCase() },
      { emitEvent: false },
    );
  }

  invalid(field: 'ticker' | 'name' | 'exchange' | 'currency' | 'reason'): boolean {
    const c = this.addForm.controls[field];
    return c.invalid && (c.touched || c.dirty);
  }

  async add(): Promise<void> {
    this.addError.set('');
    if (this.addForm.invalid) {
      this.addForm.markAllAsTouched();
      return;
    }
    const v = this.addForm.getRawValue();
    this.saving.set(true);
    try {
      const created = await firstValueFrom(
        this.api.addInstrument({
          ticker: v.ticker.trim(),
          name: v.name.trim(),
          exchange: v.exchange.trim(),
          currency: v.currency,
          type: v.type,
          sector: v.sector.trim() || undefined,
          reason: v.reason.trim(),
        }),
      );
      this.closeAdd();
      this.notice.set(
        `${created.symbol} is added and tradable. It can be traded once the live feed has a price for it.`,
      );
      this.page.set(0);
      await this.load();
    } catch (e) {
      this.addError.set(
        e instanceof HttpErrorResponse && e.status === 409
          ? 'An instrument with that ticker already exists.'
          : adminErrorMessage(e),
      );
    } finally {
      this.saving.set(false);
    }
  }

  goTo(page: number): void {
    this.page.set(page);
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    const f = this.filters.getRawValue();
    try {
      const result = await firstValueFrom(
        this.api.listInstruments(
          {
            q: f.q.trim(),
            exchange: f.exchange.trim(),
            type: (f.type || undefined) as InstrumentType | undefined,
            tradable: f.tradable === '' ? undefined : f.tradable === 'true',
          },
          { page: this.page(), size: PAGE_SIZE },
        ),
      );
      this.instruments.set(result.items);
      this.total.set(result.totalItems);
    } catch (e) {
      this.error.set(adminErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  async toggle(i: AdminInstrument): Promise<void> {
    const delisting = i.tradable;
    const reason = await this.dialog().ask(
      delisting
        ? {
            title: `Delist ${i.symbol}`,
            description:
              'New orders in this instrument are refused and it disappears from the market list. Existing holdings are kept.',
            confirmLabel: 'Delist instrument',
            danger: true,
          }
        : {
            title: `List ${i.symbol}`,
            description: 'Customers can trade this instrument again.',
            confirmLabel: 'List instrument',
          },
    );
    if (!reason) return;
    this.busy.set(i.instrumentId);
    this.error.set('');
    this.notice.set('');
    try {
      const updated = await firstValueFrom(
        delisting
          ? this.api.delistInstrument(i.instrumentId, reason)
          : this.api.relistInstrument(i.instrumentId, reason),
      );
      this.instruments.update((list) =>
        list.map((x) => (x.instrumentId === updated.instrumentId ? updated : x)),
      );
      this.notice.set(`${i.symbol} is ${delisting ? 'delisted' : 'tradable again'}.`);
    } catch (e) {
      this.error.set(adminErrorMessage(e));
    } finally {
      this.busy.set(null);
    }
  }
}
