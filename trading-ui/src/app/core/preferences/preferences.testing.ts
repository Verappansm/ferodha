import { computed, Provider, signal } from '@angular/core';
import { NumberFormat } from '../../api/preferences-api';
import { DEFAULT_PREFERENCES, PreferencesStore } from './preferences.store';

/**
 * A PreferencesStore for component tests: the defaults, nothing loaded over
 * HTTP, and no Session needed. Tests that care can set numberFormat, masked
 * or startPath, or wrap the methods with vi.spyOn.
 */
export function stubPreferences() {
  const numberFormat = signal<NumberFormat>('INTERNATIONAL');
  return {
    saved: signal(null),
    available: signal(true),
    masked: signal(false),
    values: computed(() => ({ ...DEFAULT_PREFERENCES, numberFormat: numberFormat() })),
    numberFormat,
    startPath: signal('/dashboard'),
    load: (): Promise<void> => Promise.resolve(),
    save: (): Promise<void> => Promise.resolve(),
    reset: (): Promise<void> => Promise.resolve(),
    toggleTheme: (): void => undefined,
    toggleMasked: (): void => undefined,
  };
}

export function provideStubPreferences(stub = stubPreferences()): Provider {
  return { provide: PreferencesStore, useValue: stub };
}
