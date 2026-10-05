import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, signal } from '@angular/core';

export type ThemeChoice = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'ferodha.theme';

/**
 * Light, dark, or whatever the operating system prefers. The choice is a
 * per-browser convenience kept in localStorage (a preference, not session
 * data); it is applied as <html data-theme>, which styles.css reads. With
 * 'system' the attribute is removed and the CSS media query decides.
 */
@Injectable({ providedIn: 'root' })
export class Theme {
  private readonly root = inject(DOCUMENT).documentElement;
  readonly choice = signal<ThemeChoice>(readChoice());

  constructor() {
    effect(() => {
      const choice = this.choice();
      if (choice === 'system') this.root.removeAttribute('data-theme');
      else this.root.setAttribute('data-theme', choice);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, choice);
      } catch {
        // Storage unavailable: the choice lasts until the page is reloaded.
      }
    });
  }

  /** The theme on screen now, resolving 'system' through the media query. */
  isDark(): boolean {
    const choice = this.choice();
    if (choice !== 'system') return choice === 'dark';
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /** Flips between light and dark (leaving 'system' for an explicit choice). */
  toggle(): void {
    this.choice.set(this.isDark() ? 'light' : 'dark');
  }
}

function readChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    return 'system';
  }
}
