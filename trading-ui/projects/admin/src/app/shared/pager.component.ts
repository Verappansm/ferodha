import { Component, computed, input, output } from '@angular/core';

/** "1-25 of 130" with previous and next; pages are zero-based, as the API's are. */
@Component({
  selector: 'adm-pager',
  template: `
    <div class="pager">
      <span class="pager-range" aria-live="polite">
        @if (total() > 0) {
          {{ first() }}–{{ last() }} of {{ total() }}
        } @else {
          No results
        }
      </span>
      <button
        type="button"
        class="btn btn-secondary btn-sm"
        [disabled]="page() === 0"
        (click)="pageChange.emit(page() - 1)"
      >
        Previous
      </button>
      <button
        type="button"
        class="btn btn-secondary btn-sm"
        [disabled]="last() >= total()"
        (click)="pageChange.emit(page() + 1)"
      >
        Next
      </button>
    </div>
  `,
})
export class PagerComponent {
  readonly page = input.required<number>();
  readonly size = input.required<number>();
  readonly total = input.required<number>();
  readonly pageChange = output<number>();

  readonly first = computed(() => this.page() * this.size() + 1);
  readonly last = computed(() => Math.min(this.total(), (this.page() + 1) * this.size()));
}
