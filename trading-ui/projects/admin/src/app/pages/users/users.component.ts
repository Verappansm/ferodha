import { Component, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom, Observable } from 'rxjs';
import { AdminApi, AdminUser, PlatformRole, UserStatus } from '../../api/admin-api';
import { adminErrorMessage } from '../../core/errors/admin-error-message';
import { AdminSession } from '../../core/session/admin-session';
import { PagerComponent } from '../../shared/pager.component';
import { ReasonDialogComponent, ReasonDialogOptions } from '../../shared/reason-dialog.component';
import { StatusPillComponent } from '../../shared/status-pill.component';

const PAGE_SIZE = 25;

/**
 * LEAP-021: who can sign in. Suspending revokes every session the user holds;
 * a forced reset makes them choose a new password at their next sign-in.
 * No password is ever shown or sent from here.
 */
@Component({
  selector: 'adm-users',
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
          <h1>Users</h1>
          <p>Suspend or reactivate sign-in, and force a password reset.</p>
        </div>
      </header>

      @if (notice()) {
        <p class="notice notice-success" role="status" data-testid="users-notice">{{ notice() }}</p>
      }
      @if (error()) {
        <p class="notice notice-error" role="alert" data-testid="users-error">{{ error() }}</p>
      }

      <section class="card">
        <form class="filters" [formGroup]="filters" (ngSubmit)="search()">
          <div class="field grow">
            <label class="field-label" for="q">Search</label>
            <input id="q" class="input" formControlName="q" placeholder="Name or email" />
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
            <label class="field-label" for="role">Role</label>
            <select id="role" class="input" formControlName="role">
              <option value="">Any</option>
              @for (r of roles; track r) {
                <option [value]="r">{{ r }}</option>
              }
            </select>
          </div>
          <button type="submit" class="btn btn-primary">Apply</button>
        </form>

        @if (loading() && users().length === 0) {
          <p class="state">Loading users…</p>
        } @else if (users().length === 0) {
          <p class="state">No users match.</p>
        } @else {
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th class="num">Accounts</th>
                  <th>Last sign-in</th>
                  <th>Joined</th>
                  <th><span class="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                @for (u of users(); track u.id) {
                  <tr data-testid="user-row">
                    <td>
                      <div class="cell-stack">
                        <strong>{{ u.name }}</strong>
                        <small>{{ u.email }}</small>
                        @if (u.mustChangePassword) {
                          <small>Password reset required</small>
                        }
                      </div>
                    </td>
                    <td>{{ u.role }}</td>
                    <td><adm-status-pill [status]="u.status" /></td>
                    <td class="num">{{ u.accountCount ?? 0 }}</td>
                    <td>{{ u.lastLogin ? (u.lastLogin | date: 'd MMM y, HH:mm') : '—' }}</td>
                    <td>{{ u.createdOn | date: 'd MMM y' }}</td>
                    <td>
                      <div class="actions">
                        @if (isSelf(u)) {
                          <span class="muted">You</span>
                        } @else {
                          @if (u.status === 'ACTIVE') {
                            <button
                              type="button"
                              class="btn btn-secondary btn-sm"
                              [disabled]="busy() === u.id"
                              (click)="suspend(u)"
                              data-testid="suspend-user"
                            >
                              Suspend
                            </button>
                            <button
                              type="button"
                              class="btn btn-secondary btn-sm"
                              [disabled]="busy() === u.id"
                              (click)="forceReset(u)"
                            >
                              Force password reset
                            </button>
                          }
                          @if (u.status === 'SUSPENDED') {
                            <button
                              type="button"
                              class="btn btn-secondary btn-sm"
                              [disabled]="busy() === u.id"
                              (click)="reactivate(u)"
                            >
                              Reactivate
                            </button>
                          }
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
export class UsersComponent {
  private readonly api = inject(AdminApi);
  private readonly session = inject(AdminSession);
  private readonly dialog = viewChild.required(ReasonDialogComponent);

  readonly statuses = Object.values(UserStatus);
  readonly roles = Object.values(PlatformRole);
  readonly pageSize = PAGE_SIZE;

  readonly filters = inject(NonNullableFormBuilder).group({ q: [''], status: [''], role: [''] });

  readonly users = signal<AdminUser[]>([]);
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
        this.api.listUsers(
          {
            q: f.q.trim(),
            status: (f.status || undefined) as UserStatus | undefined,
            role: (f.role || undefined) as PlatformRole | undefined,
          },
          { page: this.page(), size: PAGE_SIZE },
        ),
      );
      this.users.set(result.items);
      this.total.set(result.totalItems);
    } catch (e) {
      this.error.set(adminErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  /** An operator cannot suspend or reset themself. */
  isSelf(user: AdminUser): boolean {
    return this.session.profile()?.id === user.id;
  }

  suspend(user: AdminUser): Promise<void> {
    return this.act(
      user,
      {
        title: `Suspend ${user.name}`,
        description: 'They are signed out everywhere and cannot sign in until reactivated.',
        confirmLabel: 'Suspend user',
        danger: true,
      },
      (reason) => this.api.suspendUser(user.id, reason),
      `${user.name} is suspended.`,
    );
  }

  reactivate(user: AdminUser): Promise<void> {
    return this.act(
      user,
      {
        title: `Reactivate ${user.name}`,
        description: 'They can sign in again.',
        confirmLabel: 'Reactivate user',
      },
      (reason) => this.api.reactivateUser(user.id, reason),
      `${user.name} is active again.`,
    );
  }

  forceReset(user: AdminUser): Promise<void> {
    return this.act(
      user,
      {
        title: `Force a password reset for ${user.name}`,
        description:
          'Their current sessions end, and they must choose a new password the next time they sign in. No password is sent to them.',
        confirmLabel: 'Force reset',
        danger: true,
      },
      (reason) => this.api.forcePasswordReset(user.id, reason),
      `${user.name} must choose a new password at their next sign-in.`,
    );
  }

  private async act(
    user: AdminUser,
    options: ReasonDialogOptions,
    call: (reason: string) => Observable<AdminUser>,
    success: string,
  ): Promise<void> {
    const reason = await this.dialog().ask(options);
    if (!reason) return;
    this.busy.set(user.id);
    this.error.set('');
    this.notice.set('');
    try {
      const updated = await firstValueFrom(call(reason));
      this.users.update((list) => list.map((u) => (u.id === updated.id ? updated : u)));
      this.notice.set(success);
    } catch (e) {
      this.error.set(adminErrorMessage(e));
    } finally {
      this.busy.set(null);
    }
  }
}
