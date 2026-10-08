import { Component, computed, inject } from '@angular/core';
import { PreferencesStore } from '../../core/preferences/preferences.store';
import { Theme } from '../../core/theme/theme';

/** A sun/moon button that switches between light and dark mode. */
@Component({
  selector: 'app-theme-toggle',
  host: { class: 'theme-toggle-host' },
  template: `
    <button
      type="button"
      class="theme-toggle"
      (click)="preferences.toggleTheme()"
      [attr.aria-label]="label()"
      [attr.title]="label()"
      data-testid="theme-toggle"
    >
      @if (dark()) {
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" />
          <path
            d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8 6 18M18 6l1.8-1.8"
          />
        </svg>
      } @else {
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        </svg>
      }
    </button>
  `,
  styles: `
    .theme-toggle {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      padding: 0;
      color: inherit;
      background: transparent;
      border: 1px solid var(--toggle-border, var(--ink-300));
      border-radius: var(--radius-sm);
      cursor: pointer;
    }
    .theme-toggle:hover {
      background: var(--toggle-hover, var(--ink-100));
    }
    svg {
      width: 18px;
      height: 18px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
})
export class ThemeToggleComponent {
  protected readonly theme = inject(Theme);
  // Saves the choice as the customer's preference when signed in.
  protected readonly preferences = inject(PreferencesStore);
  protected readonly dark = computed(() => {
    this.theme.choice();
    return this.theme.isDark();
  });
  protected readonly label = computed(() =>
    this.dark() ? 'Switch to light mode' : 'Switch to dark mode',
  );
}
