import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { errorMessage } from '../../core/errors/error-message';
import { Session } from '../../core/session/session';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent {
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  // The limits are the contract's LoginRequest maxLength values. The
  // username is an email address (story_docs/contract-breach.md, B01).
  readonly form = inject(NonNullableFormBuilder).group({
    username: ['', [Validators.required, Validators.email, Validators.maxLength(64)]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
  });

  readonly isLoading = signal(false);
  readonly error = signal('');

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
      await this.router.navigateByUrl('/dashboard');
    } catch (error) {
      this.error.set(errorMessage(error));
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
