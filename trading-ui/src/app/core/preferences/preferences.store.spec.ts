import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { PreferencesApi, PreferencesResponse } from '../../api/preferences-api';
import { Session } from '../session/session';
import { Theme, THEME_STORAGE_KEY } from '../theme/theme';
import { DEFAULT_PREFERENCES, PreferencesStore } from './preferences.store';

describe('PreferencesStore', () => {
  const accountId = signal<number | null>(null);
  const isSignedIn = signal(false);
  let api: {
    get: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
  };

  const stored: PreferencesResponse = {
    ...DEFAULT_PREFERENCES,
    accountId: 7,
    defaultAccountId: 7,
    theme: 'DARK',
    startPage: 'PORTFOLIO',
    compactTables: true,
    hideBalances: true,
    numberFormat: 'INDIAN',
    customised: ['theme', 'startPage', 'compactTables', 'hideBalances', 'numberFormat'],
  };

  beforeEach(() => {
    accountId.set(null);
    isSignedIn.set(false);
    localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.classList.remove('compact');
    api = {
      get: vi.fn().mockReturnValue(of(stored)),
      update: vi.fn(),
      reset: vi
        .fn()
        .mockReturnValue(of({ ...DEFAULT_PREFERENCES, accountId: 7, defaultAccountId: 7 })),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: Session, useValue: { accountId, isSignedIn } },
        { provide: PreferencesApi, useValue: api },
      ],
    });
  });

  function signIn(): void {
    accountId.set(7);
    isSignedIn.set(true);
  }

  it('uses the defaults before anything is loaded', () => {
    const store = TestBed.inject(PreferencesStore);
    expect(store.values()).toEqual(DEFAULT_PREFERENCES);
    expect(store.startPath()).toBe('/dashboard');
  });

  it('applies the stored preferences at the next sign-in', async () => {
    const store = TestBed.inject(PreferencesStore);
    signIn();

    await store.load();
    TestBed.tick();

    expect(api.get).toHaveBeenCalledWith(7);
    expect(store.startPath()).toBe('/portfolio');
    expect(store.numberFormat()).toBe('INDIAN');
    expect(store.masked()).toBe(true);
    expect(TestBed.inject(Theme).choice()).toBe('dark');
    expect(document.documentElement.classList.contains('compact')).toBe(true);
  });

  it('loads once per sign-in, however often it is asked', async () => {
    const store = TestBed.inject(PreferencesStore);
    signIn();
    await store.load();
    TestBed.tick();
    await store.load();

    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('falls back to the defaults, and says so, when loading fails', async () => {
    api.get.mockReturnValue(throwError(() => new Error('down')));
    const store = TestBed.inject(PreferencesStore);
    signIn();

    await store.load();

    expect(store.available()).toBe(false);
    expect(store.values()).toEqual(DEFAULT_PREFERENCES);
  });

  it('forgets everything at sign-out', async () => {
    const store = TestBed.inject(PreferencesStore);
    signIn();
    await store.load();
    TestBed.tick();

    accountId.set(null);
    isSignedIn.set(false);
    TestBed.tick();

    expect(store.saved()).toBeNull();
    expect(store.masked()).toBe(false);
    expect(document.documentElement.classList.contains('compact')).toBe(false);
  });

  it('reset brings back the defaults', async () => {
    const store = TestBed.inject(PreferencesStore);
    signIn();
    await store.load();

    await store.reset();

    expect(api.reset).toHaveBeenCalledWith(7);
    expect(store.values().customised).toEqual([]);
    expect(store.masked()).toBe(false);
  });

  it('the eye icon reveals hidden balances without changing the preference', async () => {
    const store = TestBed.inject(PreferencesStore);
    signIn();
    await store.load();

    store.toggleMasked();

    expect(store.masked()).toBe(false);
    expect(api.update).not.toHaveBeenCalled();
  });
});
