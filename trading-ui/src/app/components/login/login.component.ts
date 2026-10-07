import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from '../../api/auth-api';
import { errorMessage } from '../../core/errors/error-message';
import { PreferencesStore } from '../../core/preferences/preferences.store';
import { Session } from '../../core/session/session';
import { AuthLayoutComponent } from '../auth-layout/auth-layout.component';
import { PASSWORD_MAX, PASSWORD_MIN } from '../registration/registration.component';

// Wrong email, wrong password and an account still awaiting approval all
// answer the same AUTH-401 on purpose, so the sentence covers all three.
const SIGN_IN_MESSAGES = {
  'AUTH-401':
    'That email and password did not sign you in. Check them and try again. A new account can sign in once an administrator has approved it.',
};

const CHANGE_MESSAGES = {
  'AUTH-401':
    'Your current password was not accepted, so nothing was changed. Sign in again to start over.',
  'VAL-422': `Choose a new password of ${PASSWORD_MIN} to ${PASSWORD_MAX} characters, different from the current one.`,
};

function newPasswordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('newPassword')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return confirm && password !== confirm ? { mismatch: true } : null;
}

/** The auth service's answer when an administrator forced a password reset. */
function isPasswordChangeRequired(error: unknown): boolean {
  return (
    error instanceof HttpErrorResponse &&
    (error.error as { errorCode?: unknown } | null)?.errorCode === 'AUTH-428'
  );
}

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, AuthLayoutComponent],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authApi = inject(AuthApi);
  private readonly preferences = inject(PreferencesStore);

  // The limits are the contract's LoginRequest maxLength values. The
  // username is an email address (story_docs/contract-breach.md, B01).
  readonly form = inject(NonNullableFormBuilder).group({
    username: ['', [Validators.required, Validators.email, Validators.maxLength(64)]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
  });

  readonly isLoading = signal(false);
  readonly error = signal('');
  readonly showPassword = signal(false);

  /**
   * An administrator forced a reset: the password was right, but a new one
   * is needed before any session. The typed password is kept only for the
   * change request, and dropped as soon as it is done or abandoned.
   */
  readonly mustChangePassword = signal(false);
  private heldPassword = '';
  readonly changeForm = inject(NonNullableFormBuilder).group(
    {
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

  async submit(): Promise<void> {
    if (this.form.invalid) {
      // Nothing obviously wrong reaches the wire.
      this.form.markAllAsTouched();
      return;
    }
    this.isLoading.set(true);
    this.error.set('');
    const { username, password } = this.form.getRawValue();
    try {
      await this.session.signIn(username, password);
      await this.enter();
    } catch (error) {
      if (isPasswordChangeRequired(error)) {
        this.heldPassword = password;
        this.mustChangePassword.set(true);
      } else {
        this.error.set(errorMessage(error, SIGN_IN_MESSAGES));
      }
      this.form.controls.password.reset();
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Sets the new password with the one just typed, then signs in with it. */
  async changePassword(): Promise<void> {
    if (this.changeForm.invalid) {
      this.changeForm.markAllAsTouched();
      return;
    }
    const username = this.form.controls.username.value;
    const { newPassword } = this.changeForm.getRawValue();
    if (newPassword === this.heldPassword) {
      this.error.set(CHANGE_MESSAGES['VAL-422']);
      return;
    }
    this.isLoading.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.authApi.changePassword(username, this.heldPassword, newPassword));
      this.heldPassword = '';
      await this.session.signIn(username, newPassword);
      await this.enter();
    } catch (error) {
      this.error.set(errorMessage(error, CHANGE_MESSAGES));
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Applies the customer's saved preferences before the first screen shows,
   * then lands where they were going, or on their chosen start page.
   */
  private async enter(): Promise<void> {
    await this.preferences.load();
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    await this.router.navigateByUrl(returnUrl || this.preferences.startPath());
  }

  /** Back to the sign-in form; nothing was changed. */
  cancelChange(): void {
    this.heldPassword = '';
    this.mustChangePassword.set(false);
    this.changeForm.reset();
    this.error.set('');
  }

  showChangeError(field: 'newPassword' | 'confirmPassword'): boolean {
    const control = this.changeForm.controls[field];
    if (field === 'confirmPassword') {
      return control.touched && (control.invalid || this.changeForm.hasError('mismatch'));
    }
    return control.invalid && control.touched;
  }

  showError(field: 'username' | 'password'): boolean {
    const control = this.form.controls[field];
    return control.invalid && control.touched;
  }
}
