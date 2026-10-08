import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from '../../api/auth-api';
import { errorMessage } from '../../core/errors/error-message';
import { Session } from '../../core/session/session';
import { PASSWORD_MAX, PASSWORD_MIN } from '../registration/registration.component';

/** A wrong current password reads as one sentence, never as "session ended". */
export const WRONG_CURRENT_PASSWORD = 'That is not your current password.';

function newPasswordsMatch(group: AbstractControl): ValidationErrors | null {
  const next = group.get('newPassword')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return next && confirm && next !== confirm ? { mismatch: true } : null;
}

/**
 * Settings > Security (LEAP-010): change the password, proving the current one, and sign
 * out everywhere. Either ends every session, this one included, so both return to sign-in.
 */
@Component({
  selector: 'app-security-settings',
  imports: [ReactiveFormsModule],
  template: `
    <section class="card" aria-labelledby="security-title" data-testid="security">
      <header class="card-header">
        <div>
          <h2 id="security-title">Security</h2>
          <p class="sub">Your password, and the devices you are signed in on.</p>
        </div>
      </header>

      <form
        class="card-body password"
        [formGroup]="form"
        (ngSubmit)="changePassword()"
        novalidate
        data-testid="password-form"
      >
        <h3 class="section-title">Change password</h3>
        <div class="form-grid">
          <div class="field wide">
            <label class="field-label" for="current-password">Current password</label>
            <input
              id="current-password"
              class="input"
              type="password"
              autocomplete="current-password"
              formControlName="currentPassword"
              data-testid="current-password"
            />
          </div>
          <div class="field">
            <label class="field-label" for="new-password">New password</label>
            <input
              id="new-password"
              class="input"
              type="password"
              autocomplete="new-password"
              formControlName="newPassword"
              data-testid="new-password"
              aria-describedby="new-password-hint"
            />
            <p id="new-password-hint" class="field-hint">
              {{ passwordMin }} to {{ passwordMax }} characters.
            </p>
          </div>
          <div class="field">
            <label class="field-label" for="confirm-password">Confirm new password</label>
            <input
              id="confirm-password"
              class="input"
              type="password"
              autocomplete="new-password"
              formControlName="confirmPassword"
              data-testid="confirm-password"
            />
          </div>
        </div>
        @if (form.touched && problem(); as message) {
          <p class="field-error" data-testid="password-problem">{{ message }}</p>
        }
        @if (passwordError()) {
          <p class="form-error" role="alert" data-testid="password-error">{{ passwordError() }}</p>
        }
        <div class="row-end">
          <span class="field-hint">Every device, this one included, will need to sign in again.</span>
          <button
            type="submit"
            class="btn btn-primary"
            data-testid="password-save"
            [disabled]="changing()"
          >
            {{ changing() ? 'Changing…' : 'Change password' }}
          </button>
        </div>
      </form>

      <div class="card-body everywhere">
        <div>
          <h3 class="section-title">Sign out everywhere</h3>
          <p class="field-hint">
            Ends your sessions on every device and browser, this one included.
          </p>
        </div>
        @if (confirming()) {
          <div class="confirm" data-testid="logout-all-confirm">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              [disabled]="signingOut()"
              (click)="confirming.set(false)"
            >
              Keep me signed in
            </button>
            <button
              type="button"
              class="btn btn-danger btn-sm"
              data-testid="logout-all-yes"
              [disabled]="signingOut()"
              (click)="signOutEverywhere()"
            >
              {{ signingOut() ? 'Signing out…' : 'Yes, sign out everywhere' }}
            </button>
          </div>
        } @else {
          <button
            type="button"
            class="btn btn-danger-outline"
            data-testid="logout-all"
            (click)="confirming.set(true)"
          >
            Sign out everywhere
          </button>
        }
        @if (logoutError()) {
          <p class="form-error wide" role="alert" data-testid="logout-all-error">
            {{ logoutError() }}
          </p>
        }
      </div>
    </section>
  `,
  styles: `
    .password {
      display: grid;
      gap: 14px;
      border-bottom: 1px solid var(--ink-200);
    }
    .row-end {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
    }
    .everywhere {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 24px;
      align-items: center;
      justify-content: space-between;
    }
    .everywhere .wide {
      flex-basis: 100%;
    }
    .everywhere p {
      margin: 4px 0 0;
    }
    .confirm {
      display: flex;
      gap: 8px;
      animation: notice-in 0.18s ease-out both;
    }
  `,
})
export class SecuritySettingsComponent {
  private readonly authApi = inject(AuthApi);
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  protected readonly passwordMin = PASSWORD_MIN;
  protected readonly passwordMax = PASSWORD_MAX;

  protected readonly form = inject(NonNullableFormBuilder).group(
    {
      currentPassword: ['', Validators.required],
      newPassword: [
        '',
        [
          Validators.required,
          Validators.minLength(PASSWORD_MIN),
          Validators.maxLength(PASSWORD_MAX),
        ],
      ],
      confirmPassword: ['', Validators.required],
    },
    { validators: newPasswordsMatch },
  );

  protected readonly changing = signal(false);
  protected readonly passwordError = signal('');
  protected readonly confirming = signal(false);
  protected readonly signingOut = signal(false);
  protected readonly logoutError = signal('');

  /** The first thing wrong with the form, in words; null when it can be sent. */
  protected problem(): string | null {
    const c = this.form.controls;
    if (c.currentPassword.hasError('required')) return 'Enter your current password.';
    if (c.newPassword.hasError('required')) return 'Enter a new password.';
    if (c.newPassword.hasError('minlength') || c.newPassword.hasError('maxlength')) {
      return `The new password must be ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`;
    }
    if (this.form.hasError('mismatch')) return 'The new passwords do not match.';
    if (c.confirmPassword.hasError('required')) return 'Confirm the new password.';
    if (c.newPassword.value === c.currentPassword.value) {
      return 'The new password must differ from the current one.';
    }
    return null;
  }

  async changePassword(): Promise<void> {
    this.passwordError.set('');
    this.form.markAllAsTouched();
    const username = this.session.user()?.username;
    if (this.problem() || !username) return;
    const { currentPassword, newPassword } = this.form.getRawValue();
    this.changing.set(true);
    try {
      await firstValueFrom(this.authApi.changePassword(username, currentPassword, newPassword));
      // Every refresh token is now revoked: sign in again with the new password.
      this.endSession('password-changed');
    } catch (error) {
      this.passwordError.set(errorMessage(error, { 'AUTH-401': WRONG_CURRENT_PASSWORD }));
    } finally {
      this.changing.set(false);
    }
  }

  async signOutEverywhere(): Promise<void> {
    this.logoutError.set('');
    this.signingOut.set(true);
    try {
      await firstValueFrom(this.authApi.logoutAll());
      this.endSession('signed-out-everywhere');
    } catch (error) {
      this.logoutError.set(errorMessage(error));
    } finally {
      this.signingOut.set(false);
    }
  }

  private endSession(reason: string): void {
    this.session.signOut();
    void this.router.navigate(['/login'], { queryParams: { notice: reason } });
  }
}
