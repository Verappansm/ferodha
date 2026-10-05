import { Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { adminErrorMessage } from '../../core/errors/admin-error-message';
import { safeReturnUrl } from '../../core/guards/admin.guard';
import { AdminSession } from '../../core/session/admin-session';
import { ThemeToggleComponent } from '../../shared/theme-toggle.component';

/** A refused admin sign-in: wrong credentials and a non-admin user answer alike. */
export const ADMIN_SIGN_IN_REFUSED =
  'Those credentials did not sign you in. Only administrator accounts can use this console.';

@Component({
  selector: 'adm-sign-in',
  imports: [ReactiveFormsModule, ThemeToggleComponent],
  templateUrl: './sign-in.component.html',
  styleUrl: './sign-in.component.css',
})
export class SignInComponent {
  private readonly session = inject(AdminSession);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(64)]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
  });

  readonly isLoading = signal(false);
  readonly error = signal('');

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.isLoading.set(true);
    this.error.set('');
    const { email, password } = this.form.getRawValue();
    try {
      await this.session.signIn(email, password);
      const target = safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'));
      await this.router.navigateByUrl(target);
    } catch (error) {
      this.error.set(
        error instanceof HttpErrorResponse && error.status === 401
          ? ADMIN_SIGN_IN_REFUSED
          : adminErrorMessage(error),
      );
      this.form.controls.password.reset();
    } finally {
      this.isLoading.set(false);
    }
  }

  showError(field: 'email' | 'password'): boolean {
    const control = this.form.controls[field];
    return control.invalid && control.touched;
  }
}
