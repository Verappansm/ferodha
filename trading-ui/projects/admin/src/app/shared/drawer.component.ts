import { Component, effect, ElementRef, input, output, viewChild } from '@angular/core';

/**
 * A panel that slides in from the right over a dimmed page: for a form that is
 * a task of its own (adding an instrument) rather than part of the list behind
 * it. Escape, the close button or a click on the dimmed page closes it; focus
 * moves to the first field when it opens. The form is projected, so its
 * buttons stay with the form.
 */
@Component({
  selector: 'adm-drawer',
  template: `
    @if (open()) {
      <div class="scrim" (click)="closed.emit()"></div>
      <aside
        #panel
        class="drawer"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        [attr.aria-label]="title()"
        (keydown.escape)="closed.emit()"
      >
        <header class="drawer-h">
          <h2>{{ title() }}</h2>
          <button type="button" class="icon-btn" aria-label="Close" (click)="closed.emit()">
            ✕
          </button>
        </header>
        <div class="drawer-b">
          <ng-content />
        </div>
      </aside>
    }
  `,
})
export class DrawerComponent {
  readonly open = input.required<boolean>();
  readonly title = input.required<string>();
  readonly closed = output<void>();

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  constructor() {
    effect(() => {
      const panel = this.panel();
      if (!panel) return;
      queueMicrotask(() => {
        const first = panel.nativeElement.querySelector<HTMLElement>('input, select, textarea');
        (first ?? panel.nativeElement).focus();
      });
    });
  }
}
