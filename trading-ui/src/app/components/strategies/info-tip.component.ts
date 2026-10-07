import { Component, input, signal } from '@angular/core';

/**
 * A small "i" beside a heading or a field: hover, focus or click shows what it
 * is and why it is there. A real button, so it works from the keyboard, and
 * Escape or leaving it closes the note.
 */
@Component({
  selector: 'app-info-tip',
  template: `
    <span class="tip">
      <button
        type="button"
        class="i"
        [attr.aria-label]="'What is ' + label() + '?'"
        [attr.aria-expanded]="open()"
        (click)="open.set(!open())"
        (mouseenter)="open.set(true)"
        (mouseleave)="open.set(false)"
        (blur)="open.set(false)"
        (keydown.escape)="open.set(false)"
      >
        i
      </button>
      @if (open()) {
        <span class="pop" role="tooltip">{{ text() }}</span>
      }
    </span>
  `,
  styles: `
    .tip {
      position: relative;
      display: inline-flex;
      vertical-align: middle;
      margin-left: 4px;
    }

    .i {
      width: 16px;
      height: 16px;
      padding: 0;
      font:
        italic 700 11px/14px Georgia,
        serif;
      color: var(--ink-500);
      background: transparent;
      border: 1px solid var(--ink-300);
      border-radius: 50%;
      cursor: help;
    }

    .i:hover,
    .i:focus-visible {
      color: var(--brand-600);
      border-color: var(--brand-600);
    }

    .pop {
      position: absolute;
      top: 22px;
      left: -8px;
      z-index: 20;
      width: 260px;
      padding: 10px 12px;
      font: 400 0.8rem/1.4 var(--font-sans, system-ui);
      text-transform: none;
      letter-spacing: 0;
      white-space: normal;
      color: var(--ink-900);
      background: var(--surface);
      border: 1px solid var(--ink-300);
      border-radius: var(--radius-sm);
      box-shadow: var(--shadow-card, 0 6px 20px rgb(0 0 0 / 0.15));
    }
  `,
})
export class InfoTipComponent {
  /** What the note is about, for the button's accessible name. */
  readonly label = input.required<string>();
  /** What it is and why it is there. */
  readonly text = input.required<string>();
  readonly open = signal(false);
}
