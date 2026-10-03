import { Component, computed, input } from '@angular/core';
import { OrderStatus } from '../../api/trade-api';

/**
 * Every status the Trade REST API can return. The contract's four, plus
 * PARTIALLY_FILLED, which trade_api returns under the `market-sim` profile
 * (story_docs/contract-breach.md, B13) and the generated client does not know.
 */
export type BlotterStatus = OrderStatus | 'PARTIALLY_FILLED';

/** Statuses at which an order is still working, not finished. */
export const WORKING_STATUSES: ReadonlySet<string> = new Set<BlotterStatus>([
  'NEW',
  'PARTIALLY_FILLED',
]);

/**
 * Every badge carries a word and a symbol as well as a colour, because
 * roughly one man in twelve cannot separate red from green.
 */
const BADGES: Record<BlotterStatus, { label: string; symbol: string; css: string }> = {
  NEW: { label: 'NEW (IN PROCESS)', symbol: '⟳', css: 'new' },
  PARTIALLY_FILLED: { label: 'PARTIALLY FILLED (IN PROCESS)', symbol: '◐', css: 'new' },
  FILLED: { label: 'FILLED', symbol: '✓', css: 'filled' },
  REJECTED: { label: 'REJECTED', symbol: '✕', css: 'rejected' },
  CANCELLED: { label: 'CANCELLED', symbol: '–', css: 'cancelled' },
};

@Component({
  selector: 'app-order-status-badge',
  template: `<span [class]="'badge badge-' + badge().css" data-testid="order-status-badge"
    ><span aria-hidden="true">{{ badge().symbol }}</span> {{ badge().label }}</span
  >`,
  styles: `
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.15rem 0.55rem;
      border: 1px solid currentColor;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.02em;
      white-space: nowrap;
    }
    .badge-new {
      color: #1d4ed8;
      background: #dbeafe;
    }
    .badge-filled {
      color: #15803d;
      background: #dcfce7;
    }
    .badge-rejected {
      color: #b91c1c;
      background: #fee2e2;
    }
    .badge-cancelled,
    .badge-unknown {
      color: #4b5563;
      background: #f3f4f6;
    }
  `,
})
export class OrderStatusBadgeComponent {
  readonly status = input.required<string>();
  /** A status nobody planned for still renders its own word, never a crash. */
  readonly badge = computed(
    () =>
      BADGES[this.status() as BlotterStatus] ?? {
        label: this.status(),
        symbol: '?',
        css: 'unknown',
      },
  );
}
