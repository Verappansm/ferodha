import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from '../../api/auth-api';
import { errorMessage } from '../../core/errors/error-message';
import { AuthLayoutComponent } from '../auth-layout/auth-layout.component';

/** The auth service's own password rule: length, not character classes. */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  return confirm && password !== confirm ? { mismatch: true } : null;
}

@Component({
  selector: 'app-registration',
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent],
  templateUrl: './registration.component.html',
})
export class RegistrationComponent {
  private readonly authApi = inject(AuthApi);

  readonly passwordMin = PASSWORD_MIN;

  readonly form = inject(NonNullableFormBuilder).group(
    {
      name: ['', [Validators.required, Validators.maxLength(100)]],
      // The username is an email address (contract-breach.md, B01), at most
      // 64 characters as the auth service stores it.
      email: ['', [Validators.required, Validators.email, Validators.maxLength(64)]],
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(PASSWORD_MIN),
          Validators.maxLength(PASSWORD_MAX),
        ],
      ],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );

  readonly isSubmitting = signal(false);
  readonly error = signal('');
  readonly showPassword = signal(false);
  /** The email of the account just requested; set once registration succeeds. */
  readonly submittedEmail = signal<string | null>(null);

  private readonly passwordValue = toSignal(this.form.controls.password.valueChanges, {
    initialValue: '',
  });

  /** 0 to 3, by length only, matching the service's rule. */
  readonly strength = computed(() => {
    const length = this.passwordValue().length;
    if (length === 0) return 0;
    if (length < PASSWORD_MIN) return 1;
    return length < 16 ? 2 : 3;
  });
  readonly strengthLabel = computed(
    () => ['', 'Too short', 'Good', 'Strong'][this.strength()] ?? '',
  );

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isSubmitting.set(true);
    this.error.set('');
    const { name, email, password } = this.form.getRawValue();
    try {
      await firstValueFrom(this.authApi.register(name.trim(), email.trim(), password));
      // Registration issues no token, by contract: show what happens next.
      this.submittedEmail.set(email.trim().toLowerCase());
      this.form.reset();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  showError(field: 'name' | 'email' | 'password' | 'confirmPassword'): boolean {
    const control = this.form.controls[field];
    return control.invalid && control.touched;
  }

  showMismatch(): boolean {
    return this.form.hasError('mismatch') && this.form.controls.confirmPassword.touched;
  }
}
