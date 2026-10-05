import { Component, inject, signal, viewChild } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom, Observable } from 'rxjs';
import { AccountStatus, AdminAccount, AdminApi } from '../../api/admin-api';
import { adminErrorMessage } from '../../core/errors/admin-error-message';
import { PagerComponent } from '../../shared/pager.component';
import { ReasonDialogComponent, ReasonDialogOptions } from '../../shared/reason-dialog.component';
import { StatusPillComponent } from '../../shared/status-pill.component';

const PAGE_SIZE = 25;

/**
 * LEAP-021: trading accounts. A suspended or closed account answers ACC-403
 * when it tries to trade. Closing is permanent and refused while the account
 * still has working orders.
 */
@Component({
  selector: 'adm-accounts',
  imports: [
    CurrencyPipe,
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
          <h1>Accounts</h1>
          <p>Suspend trading on an account, reactivate it, or close it permanently.</p>
        </div>
      </header>

      @if (notice()) {
        <p class="notice notice-success" role="status">{{ notice() }}</p>
      }
      @if (error()) {
        <p class="notice notice-error" role="alert">{{ error() }}</p>
      }

      <section class="card">
        <form class="filters" [formGroup]="filters" (ngSubmit)="search()">
          <div class="field grow">
            <label class="field-label" for="q">Search</label>
            <input
              id="q"
              class="input"
              formControlName="q"
              placeholder="Owner, email or account reference"
            />
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
          <button type="submit" class="btn btn-primary">Apply</button>
        </form>

        @if (loading() && accounts().length === 0) {
          <p class="state">Loading accounts…</p>
        } @else if (accounts().length === 0) {
          <p class="state">No accounts match.</p>
        } @else {
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Owner</th>
                  <th class="num">Cash balance</th>
                  <th class="num">Working orders</th>
                  <th>Status</th>
                  <th>Opened</th>
                  <th><span class="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (a of accounts(); track a.accountId) {
                  <tr data-testid="account-row">
                    <td>
                      <div class="cell-stack">
                        <span class="mono">{{ a.businessRef }}</span>
                        <small>#{{ a.accountId }}</small>
                      </div>
                    </td>
                    <td>
                      <div class="cell-stack">
                        <strong>{{ a.ownerName }}</strong>
                        <small>{{ a.ownerEmail }}</small>
                      </div>
                    </td>
                    <td class="num">{{ a.cashBalance | currency: a.currency }}</td>
                    <td class="num">{{ a.workingOrders ?? 0 }}</td>
                    <td><adm-status-pill [status]="a.status" /></td>
                    <td>{{ a.createdOn | date: 'd MMM y' }}</td>
                    <td>
                      <div class="actions">
                        @if (a.status === 'ACTIVE') {
                          <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            [disabled]="busy() === a.accountId"
                            (click)="suspend(a)"
                          >
                            Suspend
                          </button>
                        }
                        @if (a.status === 'SUSPENDED') {
                          <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            [disabled]="busy() === a.accountId"
                            (click)="reactivate(a)"
                          >
                            Reactivate
                          </button>
                        }
                        @if (a.status !== 'CLOSED') {
                          <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            [disabled]="busy() === a.accountId || (a.workingOrders ?? 0) > 0"
                            [attr.title]="
                              (a.workingOrders ?? 0) > 0
                                ? 'Cannot close while orders are in process'
                                : null
                            "
                            (click)="close(a)"
                          >
                            Close
                          </button>
                        }
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
export class AccountsComponent {
  private readonly api = inject(AdminApi);
  private readonly dialog = viewChild.required(ReasonDialogComponent);

  readonly statuses = Object.values(AccountStatus);
  readonly pageSize = PAGE_SIZE;
  readonly filters = inject(NonNullableFormBuilder).group({ q: [''], status: [''] });

  readonly accounts = signal<AdminAccount[]>([]);
  readonly page = signal(0);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly busy = signal<number | null>(null);

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

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    const f = this.filters.getRawValue();
    try {
      const result = await firstValueFrom(
        this.api.listAccounts(
          { q: f.q.trim(), status: (f.status || undefined) as AccountStatus | undefined },
          { page: this.page(), size: PAGE_SIZE },
        ),
      );
      this.accounts.set(result.items);
      this.total.set(result.totalItems);
    } catch (e) {
      this.error.set(adminErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  suspend(a: AdminAccount): Promise<void> {
    return this.act(
      a,
      {
        title: `Suspend account ${a.businessRef}`,
        description: `${a.ownerName} will not be able to place or cancel orders until it is reactivated.`,
        confirmLabel: 'Suspend account',
        danger: true,
      },
      (reason) => this.api.suspendAccount(a.accountId, reason),
      `${a.businessRef} is suspended.`,
    );
  }

  reactivate(a: AdminAccount): Promise<void> {
    return this.act(
      a,
      {
        title: `Reactivate account ${a.businessRef}`,
        description: `${a.ownerName} can trade on it again.`,
        confirmLabel: 'Reactivate account',
      },
      (reason) => this.api.reactivateAccount(a.accountId, reason),
      `${a.businessRef} is active again.`,
    );
  }

  close(a: AdminAccount): Promise<void> {
    return this.act(
      a,
      {
        title: `Close account ${a.businessRef}`,
        description:
          'Closing is permanent. The account keeps its history but can never trade again.',
        confirmLabel: 'Close account',
        danger: true,
      },
      (reason) => this.api.closeAccount(a.accountId, reason),
      `${a.businessRef} is closed.`,
    );
  }

  private async act(
    account: AdminAccount,
    options: ReasonDialogOptions,
    call: (reason: string) => Observable<AdminAccount>,
    success: string,
  ): Promise<void> {
    const reason = await this.dialog().ask(options);
    if (!reason) return;
    this.busy.set(account.accountId);
    this.error.set('');
    this.notice.set('');
    try {
      const updated = await firstValueFrom(call(reason));
      this.accounts.update((list) =>
        list.map((x) => (x.accountId === updated.accountId ? updated : x)),
      );
      this.notice.set(success);
    } catch (e) {
      this.error.set(adminErrorMessage(e));
    } finally {
      this.busy.set(null);
    }
  }
}
