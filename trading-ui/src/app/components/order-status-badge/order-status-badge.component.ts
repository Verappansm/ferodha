import { Component, computed, input } from '@angular/core';
import { OrderStatus } from '../../api/trade-api';

/**
 * Every badge carries a word and a symbol as well as a colour, because
 * roughly one man in twelve cannot separate red from green.
 */
const BADGES: Record<OrderStatus, { label: string; symbol: string }> = {
  NEW: { label: 'IN PROCESS', symbol: '⟳' },
  FILLED: { label: 'FILLED', symbol: '✓' },
  REJECTED: { label: 'REJECTED', symbol: '✕' },
  CANCELLED: { label: 'CANCELLED', symbol: '–' },
};

@Component({
  selector: 'app-order-status-badge',
  template: `<span
    [class]="'badge badge-' + status().toLowerCase()"
    data-testid="order-status-badge"
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
    .badge-cancelled {
      color: #4b5563;
      background: #f3f4f6;
    }
  `,
})
export class OrderStatusBadgeComponent {
  readonly status = input.required<OrderStatus>();
  readonly badge = computed(() => BADGES[this.status()]);
}
