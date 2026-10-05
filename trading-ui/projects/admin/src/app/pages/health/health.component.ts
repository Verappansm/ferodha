import { Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { AdminApi, SystemHealth } from '../../api/admin-api';
import { adminErrorMessage } from '../../core/errors/admin-error-message';
import { StatusPillComponent } from '../../shared/status-pill.component';

/** Re-checked on this interval while the page is open and visible; stops when it closes. */
export const HEALTH_REFRESH_MS = 30_000;

/**
 * LEAP-023: the health of every platform component, as trade_api sees it.
 * The browser never calls an internal service directly.
 */
@Component({
  selector: 'adm-health',
  imports: [DatePipe, StatusPillComponent],
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>System health</h1>
          <p>
            Checked by the platform when you ask, and every {{ refreshSeconds }} seconds while this
            page is open.
          </p>
        </div>
        <button type="button" class="btn btn-secondary" [disabled]="loading()" (click)="load()">
          {{ loading() ? 'Checking…' : 'Check now' }}
        </button>
      </header>

      @if (error()) {
        <p class="notice notice-error" role="alert">{{ error() }}</p>
      }

      @if (health(); as h) {
        <p class="muted" aria-live="polite">
          Last checked {{ h.checkedAt | date: 'd MMM y, HH:mm:ss' }}
        </p>
        <section class="health-grid">
          @for (c of h.components; track c.name) {
            <article
              class="card"
              [class.health-down]="c.status === 'DOWN'"
              data-testid="health-card"
            >
              <div class="card-header">
                <h2>{{ c.name }}</h2>
                <adm-status-pill [status]="c.status" />
              </div>
              <div class="card-body">
                <p class="muted health-detail">{{ c.detail || 'No detail reported.' }}</p>
                @if (c.latencyMs != null) {
                  <p class="health-latency">{{ c.latencyMs }} ms</p>
                }
              </div>
            </article>
          }
        </section>
      } @else if (!error()) {
        <p class="state">Checking services…</p>
      }
    </div>
  `,
})
export class HealthComponent {
  private readonly api = inject(AdminApi);

  readonly refreshSeconds = HEALTH_REFRESH_MS / 1000;
  readonly health = signal<SystemHealth | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');

  constructor() {
    void this.load();
    const timer = setInterval(() => {
      // A hidden tab does not poll.
      if (document.visibilityState === 'visible') void this.load();
    }, HEALTH_REFRESH_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.health.set(await firstValueFrom(this.api.health()));
      this.error.set('');
    } catch (e) {
      this.error.set(adminErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
