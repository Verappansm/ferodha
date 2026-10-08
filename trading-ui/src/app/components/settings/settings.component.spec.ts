import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PreferencesStore } from '../../core/preferences/preferences.store';
import {
  provideStubPreferences,
  stubPreferences,
} from '../../core/preferences/preferences.testing';
import { SettingsComponent } from './settings.component';

describe('SettingsComponent', () => {
  let fixture: ComponentFixture<SettingsComponent>;
  let store: ReturnType<typeof stubPreferences>;

  beforeEach(async () => {
    store = stubPreferences();
    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [provideStubPreferences(store)],
    }).compileComponents();
    fixture = TestBed.createComponent(SettingsComponent);
    await fixture.whenStable();
  });

  function el<T extends HTMLElement>(selector: string): T {
    return (fixture.nativeElement as HTMLElement).querySelector<T>(selector)!;
  }

  it('shows every setting on its default for a new customer', () => {
    expect(el('[data-testid="prefs-form"]').querySelectorAll('.tag').length).toBe(7);
    expect(el<HTMLButtonElement>('[data-testid="prefs-save"]').disabled).toBe(true);
    expect(el<HTMLButtonElement>('[data-testid="prefs-reset"]').disabled).toBe(true);
  });

  it('saves only the settings that were changed', async () => {
    const save = vi.spyOn(store, 'save');
    const select = el<HTMLSelectElement>('[data-testid="prefs-start-page"]');
    select.value = 'ORDERS';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    el<HTMLFormElement>('[data-testid="prefs-form"]').dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(save).toHaveBeenCalledWith({ startPage: 'ORDERS' });
    expect(el('[data-testid="prefs-status"]').textContent).toContain('Preferences saved');
  });

  it('says so when saving fails', async () => {
    vi.spyOn(store, 'save').mockRejectedValue(new Error('down'));
    const select = el<HTMLSelectElement>('[data-testid="prefs-start-page"]');
    select.value = 'ORDERS';
    select.dispatchEvent(new Event('change'));
    el<HTMLFormElement>('[data-testid="prefs-form"]').dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(el('[data-testid="prefs-status"]').textContent).toContain('could not be saved');
  });

  it('cannot choose email when no address is on file', () => {
    expect(el<HTMLInputElement>('[data-testid="prefs-email"]').disabled).toBe(true);
  });

  it('warns about unsaved changes', async () => {
    expect(fixture.componentInstance.hasUnsavedChanges()).toBe(false);
    const select = el<HTMLSelectElement>('[data-testid="prefs-start-page"]');
    select.value = 'WATCHLIST';
    select.dispatchEvent(new Event('change'));

    expect(fixture.componentInstance.hasUnsavedChanges()).toBe(true);
  });

  it('shows a notice when preferences could not be loaded', async () => {
    (TestBed.inject(PreferencesStore) as unknown as typeof store).available.set(false);
    await fixture.whenStable();

    expect(el('[data-testid="prefs-unavailable"]')).not.toBeNull();
  });
});
