import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { AdminApi, AuditEntry } from '../../api/admin-api';
import { adminErrorMessage } from '../../core/errors/admin-error-message';
import { PagerComponent } from '../../shared/pager.component';

const PAGE_SIZE = 50;

/** Every admin decision: who, what, on which record, why and when. Read-only by design. */
@Component({
  selector: 'adm-audit',
  imports: [DatePipe, PagerComponent],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>Audit log</h1>
          <p>Every administrator decision, newest first. Entries cannot be edited or removed.</p>
        </div>
        <button type="button" class="btn btn-secondary" (click)="load()">Refresh</button>
      </header>

      @if (error()) {
        <p class="notice notice-error" role="alert">{{ error() }}</p>
      }

      <section class="card">
        @if (loading() && entries().length === 0) {
          <p class="state">Loading the audit log…</p>
        } @else if (entries().length === 0) {
          <p class="state">No decisions recorded yet.</p>
        } @else {
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Administrator</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                @for (e of entries(); track e.id) {
                  <tr data-testid="audit-row">
                    <td>{{ e.at | date: 'd MMM y, HH:mm:ss' }}</td>
                    <td>{{ e.actorName }}</td>
                    <td class="mono">{{ e.action }}</td>
                    <td>
                      <div class="cell-stack">
                        <span>{{ e.targetType }}</span>
                        <small class="mono">{{ e.targetId }}</small>
                      </div>
                    </td>
                    <td>{{ e.reason ?? '—' }}</td>
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
export class AuditComponent {
  private readonly api = inject(AdminApi);

  readonly pageSize = PAGE_SIZE;
  readonly entries = signal<AuditEntry[]>([]);
  readonly page = signal(0);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal('');

  constructor() {
    void this.load();
  }

  goTo(page: number): void {
    this.page.set(page);
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await firstValueFrom(this.api.audit({ page: this.page(), size: PAGE_SIZE }));
      this.entries.set(result.items);
      this.total.set(result.totalItems);
    } catch (e) {
      this.error.set(adminErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
