import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Session } from '../../core/session/session';

// The pages a visitor lands on when something is wrong, each saying what happened
// and where to go next (LEAP-025). None of them is ever a blank screen. Signed out
// there is no navigation bar, so the page carries the logo itself.
const STYLES = `
  .status {
    display: grid; place-items: center; min-height: calc(100vh - 60px);
    padding: 2rem 1rem; text-align: center;
  }
  .status-inner { display: grid; justify-items: center; max-width: 34rem; }
  .status-brand {
    display: inline-flex; gap: .6rem; align-items: center; margin-bottom: 2.5rem;
    font-size: 1.05rem; font-weight: 700; color: var(--ink-900); text-decoration: none;
  }
  .status-brand img { width: 32px; height: 32px; border-radius: 8px; }
  .code {
    margin: 0 0 .75rem; font-size: clamp(3.5rem, 12vw, 5.5rem); font-weight: 800; line-height: 1;
    letter-spacing: -.04em; color: var(--brand-600);
    background: linear-gradient(135deg, var(--brand-400), var(--brand-700));
    -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
  }
  .code.word { font-size: clamp(2.5rem, 9vw, 3.75rem); }
  .status h1 { margin: 0 0 .5rem; font-size: 1.6rem; color: var(--ink-900); }
  .status p.lead { margin: 0 0 1.75rem; color: var(--ink-700); }
  .actions { display: flex; flex-wrap: wrap; gap: .75rem; justify-content: center; }
`;

const BRAND = `
  @if (!session.isSignedIn()) {
    <a class="status-brand" routerLink="/login">
      <img src="favicon.svg" alt="" width="32" height="32" />Ferodha
    </a>
  }
`;

/** An address no route matches. */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  styles: STYLES,
  template: `
    <section class="status" data-testid="not-found">
      <div class="status-inner">
        ${BRAND}
        <p class="code" aria-hidden="true">404</p>
        <h1>Page not found</h1>
        <p class="lead">
          There is nothing at this address. The link may be old, or the page may have moved.
        </p>
        <div class="actions">
          <a class="btn btn-primary" [routerLink]="home()">{{
            session.isSignedIn() ? 'Go to your dashboard' : 'Go to sign in'
          }}</a>
          <a class="btn btn-secondary" routerLink="/help">Get help</a>
        </div>
      </div>
    </section>
  `,
})
export class NotFoundComponent {
  protected readonly session = inject(Session);
  protected home(): string {
    return this.session.isSignedIn() ? '/dashboard' : '/login';
  }
}

/** A page the signed-in role may not open. */
@Component({
  selector: 'app-forbidden',
  imports: [RouterLink],
  styles: STYLES,
  template: `
    <section class="status" data-testid="forbidden">
      <div class="status-inner">
        ${BRAND}
        <p class="code" aria-hidden="true">403</p>
        <h1>You can't open this page</h1>
        <p class="lead">
          Your account doesn't have access to it. If you think it should, contact support and say
          which page you were trying to reach.
        </p>
        <div class="actions">
          <a class="btn btn-primary" routerLink="/dashboard">Go to your dashboard</a>
          <a class="btn btn-secondary" routerLink="/help">Get help</a>
        </div>
      </div>
    </section>
  `,
})
export class ForbiddenComponent {
  protected readonly session = inject(Session);
}

/** An unexpected failure that no screen handled itself. */
@Component({
  selector: 'app-error-page',
  imports: [RouterLink],
  styles: STYLES,
  template: `
    <section class="status" data-testid="error-page" role="alert">
      <div class="status-inner">
        ${BRAND}
        <p class="code word" aria-hidden="true">Oops</p>
        <h1>Something went wrong</h1>
        <p class="lead">
          That wasn't your doing, and nothing you entered was lost or sent twice. Try again, or go
          back to your dashboard.
        </p>
        <div class="actions">
          <button type="button" class="btn btn-primary" data-testid="error-retry" (click)="back()">
            Try again
          </button>
          <a
            class="btn btn-secondary"
            [routerLink]="session.isSignedIn() ? '/dashboard' : '/login'"
            >{{ session.isSignedIn() ? 'Go to your dashboard' : 'Go to sign in' }}</a
          >
        </div>
      </div>
    </section>
  `,
})
export class ErrorPageComponent {
  protected readonly session = inject(Session);
  private readonly router = inject(Router);
  protected back(): void {
    history.length > 1 ? history.back() : void this.router.navigateByUrl('/dashboard');
  }
}
