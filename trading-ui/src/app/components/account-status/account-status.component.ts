import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AccountStatusResponse, AuthApi } from '../../api/auth-api';
import { errorMessage } from '../../core/errors/error-message';
import { AuthLayoutComponent } from '../auth-layout/auth-layout.component';

/** A wrong email or password reads as one sentence here, never as "session ended". */
export const STATUS_REFUSED =
  'That email and password do not match a registration. Check them and try again.';

/**
 * The account-request status page (LEAP-012), reachable signed out. The visitor proves who
 * they are with their email and password, the way sign-in does, and sees where their request
 * stands. A registrant who has not entered the emailed code yet can enter it, or ask for a
 * new one, here. Nothing on this page stores a token.
 */
@Component({
  selector: 'app-account-status',
  imports: [ReactiveFormsModule, RouterLink, DatePipe, AuthLayoutComponent],
  template: `
    <app-auth-layout active="status">
      <header class="form-header">
        <h1>Account request</h1>
        <p>A new account opens once an administrator approves it. Check where yours stands.</p>
      </header>

      @if (status(); as s) {
        <ol class="steps" data-testid="status-steps">
          <li class="done"><span aria-hidden="true">1</span> Registered</li>
          <li [class.done]="s.emailVerified" [class.current]="!s.emailVerified">
            <span aria-hidden="true">2</span> Email confirmed
          </li>
          <li
            [class.done]="s.status === 'APPROVED'"
            [class.current]="s.emailVerified && s.status === 'PENDING'"
          >
            <span aria-hidden="true">3</span> Approved by an administrator
          </li>
        </ol>

        @switch (s.status) {
          @case ('APPROVED') {
            <p class="notice notice-success" data-testid="status-approved">
              Your account is open{{ s.decidedAt ? ' since ' + (s.decidedAt | date: 'd MMM y') : '' }}.
              You can sign in now.
            </p>
            <a class="btn btn-primary btn-block" routerLink="/login" data-testid="status-signin"
              >Sign in</a
            >
          }
          @case ('REJECTED') {
            <p class="notice notice-error" data-testid="status-rejected">
              Your request was not approved{{
                s.decidedAt ? ' on ' + (s.decidedAt | date: 'd MMM y') : ''
              }}.
              @if (s.reason) {
                Reason: {{ s.reason }}
              }
            </p>
            <p class="footnote">
              Contact support if you think this is a mistake; please quote the email you registered
              with.
            </p>
          }
          @case ('NONE') {
            <p class="notice notice-warning" data-testid="status-none">
              No account request is on file for this registration. Contact support.
            </p>
          }
          @default {
            @if (!s.emailVerified) {
              <p class="notice notice-warning" data-testid="status-unverified">
                Enter the 6-digit code we emailed you. An administrator can approve your request
                only after that.
              </p>
              <form class="form code-form" (ngSubmit)="verify()" novalidate>
                <div class="field">
                  <label class="field-label" for="status-code">Code from your email</label>
                  <input
                    id="status-code"
                    class="input"
                    inputmode="numeric"
                    autocomplete="one-time-code"
                    maxlength="6"
                    [value]="code()"
                    (input)="code.set($any($event.target).value)"
                    data-testid="status-code"
                  />
                </div>
                @if (codeMessage(); as m) {
                  <p [class]="m.ok ? 'field-hint' : 'field-error'" role="status">{{ m.text }}</p>
                }
                <button
                  type="submit"
                  class="btn btn-primary btn-block"
                  [disabled]="codeBusy()"
                  data-testid="status-verify"
                >
                  {{ codeBusy() ? 'Checking…' : 'Confirm email' }}
                </button>
                <button type="button" class="btn btn-link" (click)="resend()" [disabled]="codeBusy()">
                  Send me a new code
                </button>
              </form>
            } @else {
              <p class="notice notice-info" data-testid="status-pending">
                Your request is waiting for an administrator{{
                  s.requestedAt ? ' (sent ' + (s.requestedAt | date: 'd MMM y, HH:mm') + ')' : ''
                }}. You can sign in as soon as it is approved.
              </p>
            }
          }
        }
        <button type="button" class="btn btn-secondary btn-block" (click)="reset()">
          Check another registration
        </button>
      } @else {
        <form class="form" [formGroup]="form" (ngSubmit)="check()" novalidate>
          <div class="field">
            <label class="field-label" for="status-email">Email address</label>
            <input
              id="status-email"
              class="input"
              type="email"
              autocomplete="username"
              formControlName="username"
              data-testid="status-email"
            />
          </div>
          <div class="field">
            <label class="field-label" for="status-password">Password</label>
            <input
              id="status-password"
              class="input"
              type="password"
              autocomplete="current-password"
              formControlName="password"
              data-testid="status-password"
            />
          </div>
          @if (form.touched && form.invalid) {
            <p class="field-error">Enter the email and password you registered with.</p>
          }
          @if (error()) {
            <p class="form-error" role="alert" data-testid="status-error">{{ error() }}</p>
          }
          <button
            type="submit"
            class="btn btn-primary btn-block"
            [disabled]="busy()"
            data-testid="status-check"
          >
            {{ busy() ? 'Checking…' : 'Check status' }}
          </button>
          <p class="footnote"><a routerLink="/login">Back to sign in</a></p>
        </form>
      }
    </app-auth-layout>
  `,
  styles: `
    .code-form {
      margin-top: 12px;
    }
    .btn-block + .btn-block {
      margin-top: 10px;
    }
    .notice {
      margin-bottom: 14px;
    }
  `,
})
export class AccountStatusComponent {
  private readonly authApi = inject(AuthApi);

  protected readonly form = inject(NonNullableFormBuilder).group({
    username: ['', [Validators.required, Validators.email, Validators.maxLength(64)]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
  });

  readonly status = signal<AccountStatusResponse | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly code = signal('');
  readonly codeBusy = signal(false);
  readonly codeMessage = signal<{ ok: boolean; text: string } | null>(null);

  async check(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const { username, password } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    try {
      this.status.set(await firstValueFrom(this.authApi.accountStatus(username.trim(), password)));
    } catch (error) {
      this.error.set(errorMessage(error, { 'AUTH-401': STATUS_REFUSED }));
    } finally {
      this.busy.set(false);
    }
  }

  async verify(): Promise<void> {
    const code = this.code().trim();
    if (!/^[0-9]{6}$/.test(code)) {
      this.codeMessage.set({ ok: false, text: 'Enter the 6-digit code from your email.' });
      return;
    }
    this.codeBusy.set(true);
    try {
      await firstValueFrom(this.authApi.verifyEmail(this.email(), code));
      this.codeMessage.set(null);
      await this.check();
    } catch {
      this.codeMessage.set({
        ok: false,
        text: 'That code is wrong or has expired. Check it, or ask for a new one.',
      });
    } finally {
      this.codeBusy.set(false);
    }
  }

  async resend(): Promise<void> {
    this.codeBusy.set(true);
    try {
      await firstValueFrom(this.authApi.resendCode(this.email()));
      this.codeMessage.set({
        ok: true,
        text: 'If a code can be sent, it is on its way. You can ask again after a minute.',
      });
    } catch (error) {
      this.codeMessage.set({ ok: false, text: errorMessage(error) });
    } finally {
      this.codeBusy.set(false);
    }
  }

  reset(): void {
    this.status.set(null);
    this.code.set('');
    this.codeMessage.set(null);
    this.form.reset();
  }

  private email(): string {
    return this.form.controls.username.value.trim().toLowerCase();
  }
}
