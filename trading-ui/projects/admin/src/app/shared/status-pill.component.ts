import { Component, computed, input } from '@angular/core';

type Tone = 'positive' | 'info' | 'warning' | 'negative' | 'neutral';

/** Every status the console shows, with its tone. The word is always shown, never colour alone. */
const TONES: Record<string, Tone> = {
  ACTIVE: 'positive',
  APPROVED: 'positive',
  FILLED: 'positive',
  UP: 'positive',
  TRADABLE: 'positive',
  PENDING: 'warning',
  NEW: 'info',
  PARTIALLY_FILLED: 'info',
  DEGRADED: 'warning',
  SUSPENDED: 'warning',
  DELISTED: 'neutral',
  REJECTED: 'negative',
  CLOSED: 'neutral',
  CANCELLED: 'neutral',
  DOWN: 'negative',
};

@Component({
  selector: 'adm-status-pill',
  template: `<span class="pill pill-{{ tone() }}" data-testid="status-pill">{{ label() }}</span>`,
})
export class StatusPillComponent {
  readonly status = input.required<string>();
  readonly tone = computed<Tone>(() => TONES[this.status()] ?? 'neutral');
  readonly label = computed(() => this.status().replaceAll('_', ' '));
}
