import { TestBed } from '@angular/core/testing';
import { Theme, THEME_STORAGE_KEY } from './theme';

describe('Theme', () => {
  beforeEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.removeAttribute('data-theme');
  });

  function create(): Theme {
    const theme = TestBed.inject(Theme);
    TestBed.tick();
    return theme;
  }

  it('follows the system when nothing was chosen', () => {
    const theme = create();
    expect(theme.choice()).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('applies and remembers an explicit choice', () => {
    const theme = create();

    theme.choice.set('dark');
    TestBed.tick();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('toggling from dark goes to light', () => {
    const theme = create();
    theme.choice.set('dark');

    theme.toggle();
    TestBed.tick();

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('restores a saved choice on start-up', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(create().choice()).toBe('light');
  });
});
