import { Component, inject, signal, viewChild } from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { AccountRequest, AccountRequestStatus, AdminApi } from '../../api/admin-api';
import { adminErrorMessage } from '../../core/errors/admin-error-message';
import { ReasonDialogComponent } from '../../shared/reason-dialog.component';
import { StatusPillComponent } from '../../shared/status-pill.component';
import { ApproveDialogComponent } from './approve-dialog.component';

type Filter = AccountRequestStatus | 'ALL';

/**
 * LEAP-011: registered users waiting for a trading account. Approving opens
 * the account; rejecting records a reason the applicant is shown. Pending
 * requests are listed oldest first, so nobody waits longest by accident.
 */
@Component({
  selector: 'adm-account-requests',
  imports: [
    DatePipe,
    TitleCasePipe,
    StatusPillComponent,
    ReasonDialogComponent,
    ApproveDialogComponent,
  ],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Account requests</h1>
          <p>Approve to open a trading account, or reject with a reason the applicant will see.</p>
        </div>
        <div class="segmented" role="group" aria-label="Filter by status">
          @for (f of filters; track f) {
            <button
              type="button"
              [attr.aria-pressed]="filter() === f"
              (click)="setFilter(f)"
              [attr.data-testid]="'filter-' + f"
            >
              {{ f === 'ALL' ? 'All' : (f | titlecase) }}
            </button>
          }
        </div>
      </header>

      @if (notice()) {
        <p class="notice notice-success" role="status" data-testid="requests-notice">
          {{ notice() }}
        </p>
      }
      @if (error()) {
        <p class="notice notice-error" role="alert" data-testid="requests-error">{{ error() }}</p>
      }

      <section class="card">
        @if (loading() && requests().length === 0) {
          <p class="state">Loading requests…</p>
        } @else if (requests().length === 0) {
          <p class="state" data-testid="requests-empty">
            {{ filter() === 'PENDING' ? 'No requests waiting for a decision.' : 'No requests.' }}
          </p>
        } @else {
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Requested</th>
                  <th>Currency</th>
                  <th>Status</th>
                  <th>Decision</th>
                  <th><span class="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (r of requests(); track r.requestId) {
                  <tr data-testid="request-row">
                    <td>
                      <div class="cell-stack">
                        <strong>{{ r.applicantName }}</strong>
                        <small>{{ r.applicantEmail }}</small>
                      </div>
                    </td>
                    <td>{{ r.requestedAt | date: 'd MMM y, HH:mm' }}</td>
                    <td>{{ r.currency }}</td>
                    <td><adm-status-pill [status]="r.status" /></td>
                    <td>
                      @if (r.decidedAt) {
                        <div class="cell-stack">
                          <span
                            >{{ r.decidedByName }} · {{ r.decidedAt | date: 'd MMM, HH:mm' }}</span
                          >
                          @if (r.reason) {
                            <small>“{{ r.reason }}”</small>
                          }
                          @if (r.accountId) {
                            <small>Account #{{ r.accountId }}</small>
                          }
                        </div>
                      } @else {
                        <span class="muted">Awaiting decision</span>
                      }
                    </td>
                    <td>
                      @if (r.status === 'PENDING') {
                        <div class="actions">
                          <button
                            type="button"
                            class="btn btn-primary btn-sm"
                            [disabled]="busy() === r.requestId"
                            (click)="approve(r)"
                            data-testid="approve"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            class="btn btn-secondary btn-sm"
                            [disabled]="busy() === r.requestId"
                            (click)="reject(r)"
                            data-testid="reject"
                          >
                            Reject
                          </button>
                        </div>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    </div>

    <adm-approve-dialog />
    <adm-reason-dialog />
  `,
})
export class AccountRequestsComponent {
  private readonly api = inject(AdminApi);
  private readonly approveDialog = viewChild.required(ApproveDialogComponent);
  private readonly reasonDialog = viewChild.required(ReasonDialogComponent);

  readonly filters: Filter[] = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'];
  readonly filter = signal<Filter>('PENDING');
  readonly requests = signal<AccountRequest[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  /** The request an action is in flight for, so its buttons cannot be pressed twice. */
  readonly busy = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  setFilter(filter: Filter): void {
    this.filter.set(filter);
    this.notice.set('');
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const status = this.filter() === 'ALL' ? undefined : (this.filter() as AccountRequestStatus);
      const items = await firstValueFrom(this.api.accountRequests(status));
      this.requests.set([...items].sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)));
    } catch (e) {
      this.error.set(adminErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  async approve(request: AccountRequest): Promise<void> {
    const details = await this.approveDialog().ask(request);
    if (!details) return;
    await this.decide(request, async () => {
      const done = await firstValueFrom(
        this.api.approveRequest(
          request.requestId,
          details.bankAccountNumber,
          details.currency,
          details.note || undefined,
        ),
      );
      return `Approved ${request.applicantName}: account #${done.accountId ?? '—'} is open.`;
    });
  }

  async reject(request: AccountRequest): Promise<void> {
    const reason = await this.reasonDialog().ask({
      title: 'Reject account request',
      description: `${request.applicantName} will not get a trading account. They will see the reason you give.`,
      confirmLabel: 'Reject request',
      danger: true,
    });
    if (!reason) return;
    await this.decide(request, async () => {
      await firstValueFrom(this.api.rejectRequest(request.requestId, reason));
      return `Rejected the request from ${request.applicantName}.`;
    });
  }

  private async decide(request: AccountRequest, action: () => Promise<string>): Promise<void> {
    this.busy.set(request.requestId);
    this.error.set('');
    this.notice.set('');
    try {
      this.notice.set(await action());
      await this.load();
    } catch (e) {
      this.error.set(adminErrorMessage(e));
    } finally {
      this.busy.set(null);
    }
  }
}
