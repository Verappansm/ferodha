import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { CanDeactivateFn } from '@angular/router';
import {
  NotificationChannel,
  NumberFormat,
  PreferencesUpdateRequest,
  StartPage,
  ThemePreference,
} from '../../api/preferences-api';
import { formatNumber } from '../../core/format/number-format';
import { PreferencesStore, PreferenceValues } from '../../core/preferences/preferences.store';
import { Theme } from '../../core/theme/theme';

const START_PAGES: { value: StartPage; label: string }[] = [
  { value: 'DASHBOARD', label: 'Dashboard' },
  { value: 'PORTFOLIO', label: 'Portfolio' },
  { value: 'WATCHLIST', label: 'Watchlist' },
  { value: 'ORDERS', label: 'Orders' },
];

/**
 * Settings > Preferences (LEAP-010): how alerts reach the customer, and how
 * the app looks and opens for them. Only the settings changed here are sent;
 * a setting never changed shows a "Default" tag.
 */
@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css'],
})
export class SettingsComponent implements OnDestroy {
  protected readonly preferences = inject(PreferencesStore);
  private readonly theme = inject(Theme);

  protected readonly startPages = START_PAGES;
  protected readonly sample = (format: NumberFormat) => formatNumber(100000, format, '1.2-2');

  protected readonly form = inject(NonNullableFormBuilder).group({
    notificationChannel: ['IN_APP' as NotificationChannel],
    notifyOn: inject(NonNullableFormBuilder).group({
      orderFilled: [true],
      orderRejected: [true],
      orderCancelled: [true],
      priceAlerts: [true],
    }),
    theme: ['LIGHT' as ThemePreference],
    numberFormat: ['INTERNATIONAL' as NumberFormat],
    compactTables: [false],
    hideBalances: [false],
    startPage: ['DASHBOARD' as StartPage],
  });

  protected readonly saving = signal(false);
  protected readonly status = signal<{ kind: 'saved' | 'error'; text: string } | null>(null);
  protected readonly accountId = computed(() => this.preferences.saved()?.defaultAccountId ?? null);
  private readonly formValue = toSignal(this.form.valueChanges);

  constructor() {
    // Fill the form whenever the stored preferences change (load, save, reset).
    effect(() => this.fill(this.preferences.values()));
    // Preview the theme as soon as it is picked; ngOnDestroy undoes an unsaved one.
    effect(() => {
      const picked = this.formValue()?.theme;
      if (picked) this.theme.choice.set(picked === 'DARK' ? 'dark' : 'light');
    });
  }

  protected isDefault(setting: keyof PreferenceValues): boolean {
    return !this.preferences.values().customised.includes(setting);
  }

  /** True while the form holds changes that have not been saved. */
  hasUnsavedChanges(): boolean {
    return this.form.dirty;
  }

  protected async save(): Promise<void> {
    const changes = this.changes();
    if (Object.keys(changes).length === 0) return;
    this.saving.set(true);
    this.status.set(null);
    try {
      await this.preferences.save(changes);
      this.status.set({ kind: 'saved', text: 'Preferences saved.' });
    } catch {
      this.status.set({ kind: 'error', text: 'Your preferences could not be saved. Try again.' });
    } finally {
      this.saving.set(false);
    }
  }

  protected async resetToDefaults(): Promise<void> {
    this.saving.set(true);
    this.status.set(null);
    try {
      await this.preferences.reset();
      this.status.set({ kind: 'saved', text: 'Preferences reset to the defaults.' });
    } catch {
      this.status.set({ kind: 'error', text: 'Your preferences could not be reset. Try again.' });
    } finally {
      this.saving.set(false);
    }
  }

  ngOnDestroy(): void {
    // Leaving without saving: put the saved theme back.
    const saved = this.preferences.values().theme;
    this.theme.choice.set(saved === 'DARK' ? 'dark' : 'light');
  }

  private fill(values: PreferenceValues): void {
    this.form.reset({
      notificationChannel: values.notificationChannel,
      notifyOn: { ...values.notifyOn },
      theme: values.theme,
      numberFormat: values.numberFormat,
      compactTables: values.compactTables,
      hideBalances: values.hideBalances,
      startPage: values.startPage,
    });
  }

  /** Only what was changed on the form, so untouched settings stay on default. */
  private changes(): PreferencesUpdateRequest {
    const controls = this.form.controls;
    const changes: PreferencesUpdateRequest = {};
    if (controls.notificationChannel.dirty)
      changes.notificationChannel = controls.notificationChannel.value;
    if (controls.theme.dirty) changes.theme = controls.theme.value;
    if (controls.numberFormat.dirty) changes.numberFormat = controls.numberFormat.value;
    if (controls.compactTables.dirty) changes.compactTables = controls.compactTables.value;
    if (controls.hideBalances.dirty) changes.hideBalances = controls.hideBalances.value;
    if (controls.startPage.dirty) changes.startPage = controls.startPage.value;
    const notify = controls.notifyOn.controls;
    const notifyChanges: NonNullable<PreferencesUpdateRequest['notifyOn']> = {};
    for (const key of Object.keys(notify) as (keyof typeof notify)[]) {
      if (notify[key].dirty) notifyChanges[key] = notify[key].value;
    }
    if (Object.keys(notifyChanges).length > 0) changes.notifyOn = notifyChanges;
    return changes;
  }
}

/** Asks before leaving Settings with changes that were not saved. */
export const unsavedPreferencesGuard: CanDeactivateFn<SettingsComponent> = (component) =>
  !component.hasUnsavedChanges() || confirm('You have unsaved changes. Leave anyway?');
