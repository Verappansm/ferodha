import { Component, input, signal } from '@angular/core';

/**
 * A small "i" beside a heading or a figure: hover, focus or click shows what it
 * is and why it is there. A real button, so it works from the keyboard; Escape
 * or leaving it closes the note.
 */
@Component({
  selector: 'adm-info-tip',
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
      margin-left: 6px;
      vertical-align: middle;
      text-transform: none;
      letter-spacing: 0;
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
      z-index: 30;
      width: 250px;
      padding: 10px 12px;
      font:
        400 0.8rem/1.4 var(--font-sans),
        system-ui;
      font-weight: 400;
      color: var(--ink-900);
      white-space: normal;
      background: var(--surface);
      border: 1px solid var(--ink-300);
      border-radius: var(--radius-sm);
      box-shadow: 0 8px 24px rgb(16 24 40 / 16%);
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
