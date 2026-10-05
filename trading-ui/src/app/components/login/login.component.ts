import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { errorMessage } from '../../core/errors/error-message';
import { Session } from '../../core/session/session';
import { AuthLayoutComponent } from '../auth-layout/auth-layout.component';

// Wrong email, wrong password and an account still awaiting approval all
// answer the same AUTH-401 on purpose, so the sentence covers all three.
const SIGN_IN_MESSAGES = {
  'AUTH-401':
    'That email and password did not sign you in. Check them and try again. A new account can sign in once an administrator has approved it.',
};

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, AuthLayoutComponent],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // The limits are the contract's LoginRequest maxLength values. The
  // username is an email address (story_docs/contract-breach.md, B01).
  readonly form = inject(NonNullableFormBuilder).group({
    username: ['', [Validators.required, Validators.email, Validators.maxLength(64)]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
  });

  readonly isLoading = signal(false);
  readonly error = signal('');
  readonly showPassword = signal(false);

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
      // Land the user where they were going, or at the dashboard if no return address.
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      await this.router.navigateByUrl(returnUrl || '/dashboard');
    } catch (error) {
      this.error.set(errorMessage(error, SIGN_IN_MESSAGES));
      this.form.controls.password.reset();
    } finally {
      this.isLoading.set(false);
    }
  }

  showError(field: 'username' | 'password'): boolean {
    const control = this.form.controls[field];
    return control.invalid && control.touched;
  }
}
