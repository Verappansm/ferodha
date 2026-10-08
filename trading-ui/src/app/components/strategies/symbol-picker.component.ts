import { Component, computed, effect, input, model, signal, untracked } from '@angular/core';

export interface SymbolOption {
  symbol: string;
  name: string;
}

let nextId = 0;

/**
 * A searchable drop-down over the instruments that exist: type part of a
 * symbol or a company name, pick with the mouse or Up, Down and Enter. Only a
 * listed instrument can be chosen, so a mistyped symbol cannot get through -
 * unless `freeText` is on (the order ticket), where what is typed is the value
 * and the platform's own validation answers for it.
 */
@Component({
  selector: 'app-symbol-picker',
  template: `
    <div class="picker">
      <input
        class="input"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        [attr.data-testid]="testId()"
        [attr.aria-label]="label()"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="listId"
        [attr.aria-activedescendant]="open() && matches().length ? optionId(active()) : null"
        [placeholder]="placeholder()"
        [value]="query()"
        (input)="onInput($event)"
        (focus)="open.set(true)"
        (blur)="onBlur()"
        (keydown)="onKey($event)"
      />
      @if (open()) {
        <ul class="list" role="listbox" [id]="listId">
          @for (o of matches(); track o.symbol; let i = $index) {
            <li
              role="option"
              [id]="optionId(i)"
              [class.active]="i === active()"
              [attr.aria-selected]="o.symbol === value()"
              data-testid="symbol-option"
              (mousedown)="$event.preventDefault(); select(o)"
              (mouseenter)="active.set(i)"
            >
              <strong>{{ o.symbol }}</strong>
              <span class="name">{{ o.name }}</span>
            </li>
          } @empty {
            <li class="empty" role="presentation">{{ emptyText() }}</li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    .picker {
      position: relative;
    }

    .input {
      width: 100%;
      height: 38px;
      padding: 0 12px;
      font: inherit;
      color: var(--ink-900);
      background: var(--surface);
      border: 1px solid var(--ink-200);
      border-radius: var(--radius-sm);
    }

    .input:focus {
      outline: none;
      border-color: var(--brand-600);
      box-shadow: var(--focus-ring);
    }

    .list {
      position: absolute;
      z-index: 15;
      inset-inline: 0;
      top: calc(100% + 4px);
      max-height: 240px;
      margin: 0;
      padding: 4px;
      overflow-y: auto;
      list-style: none;
      background: var(--surface);
      border: 1px solid var(--ink-300);
      border-radius: var(--radius-sm);
      box-shadow: var(--shadow-card, 0 6px 20px rgb(0 0 0 / 0.15));
    }

    li {
      display: flex;
      gap: 10px;
      align-items: baseline;
      padding: 7px 10px;
      border-radius: 6px;
      cursor: pointer;
    }

    li.active {
      background: var(--ink-100);
    }

    li.empty {
      color: var(--ink-500);
      cursor: default;
    }

    .name {
      overflow: hidden;
      font-size: 0.85rem;
      color: var(--ink-500);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class SymbolPickerComponent {
  readonly options = input.required<SymbolOption[]>();
  /** The chosen symbol; empty until one is picked. */
  readonly value = model<string>('');
  readonly label = input('Symbol');
  readonly placeholder = input('Search a symbol or company');
  readonly emptyText = input('No matching instrument');
  readonly testId = input('symbol-picker');
  /** What is typed is the value at once, upper-cased; the list only suggests. */
  readonly freeText = input(false);

  readonly listId = `symbol-list-${nextId++}`;
  readonly query = signal('');
  readonly open = signal(false);
  readonly active = signal(0);

  constructor() {
    // A value set from outside (a prefilled link, a reset form) shows in the box.
    effect(() => {
      const value = this.value();
      untracked(() => {
        if (this.query().trim().toUpperCase() !== value.toUpperCase()) this.query.set(value);
      });
    });
  }

  readonly matches = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.options();
    // Showing the whole list while the box holds the current choice lets the
    // customer open it and pick something else.
    const filtered =
      !q || q === this.value().toLowerCase()
        ? all
        : all.filter((o) => o.symbol.toLowerCase().includes(q) || o.name.toLowerCase().includes(q));
    return filtered.slice(0, 50);
  });

  optionId(index: number): string {
    return `${this.listId}-${index}`;
  }

  onInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.query.set(text);
    this.open.set(true);
    this.active.set(0);
    if (this.freeText()) {
      this.value.set(text.trim().toUpperCase());
    } else if (text === '') {
      this.value.set('');
    }
  }

  select(option: SymbolOption): void {
    this.value.set(option.symbol);
    this.query.set(option.symbol);
    this.open.set(false);
  }

  onBlur(): void {
    // Typing an exact symbol and leaving counts as choosing it; anything else
    // goes back to the last real choice.
    const typed = this.query().trim().toUpperCase();
    const exact = this.options().find((o) => o.symbol === typed);
    if (exact) {
      this.select(exact);
    } else if (!this.freeText()) {
      this.query.set(this.value());
    }
    this.open.set(false);
  }

  onKey(event: KeyboardEvent): void {
    const count = this.matches().length;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.open.set(true);
      this.active.set(count ? (this.active() + 1) % count : 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.active.set(count ? (this.active() - 1 + count) % count : 0);
    } else if (event.key === 'Enter' && this.open() && count) {
      event.preventDefault();
      this.select(this.matches()[this.active()]);
    } else if (event.key === 'Escape') {
      this.open.set(false);
    }
  }
}
