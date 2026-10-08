import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Session } from '../../core/session/session';

// The pages a visitor lands on when something is wrong, each saying what happened
// and where to go next (LEAP-025). None of them is ever a blank screen.
const STYLES = `
  .status { max-width: 36rem; margin: 4rem auto; padding: 0 1rem; text-align: center; }
  .status h1 { font-size: 1.75rem; margin: 0 0 .5rem; color: var(--ink-900); }
  .status p { color: var(--ink-700); margin: 0 0 1.5rem; }
  .status .code { font-size: .875rem; letter-spacing: .08em; color: var(--ink-500); margin: 0 0 .5rem; }
  .status .actions { display: flex; gap: .75rem; justify-content: center; flex-wrap: wrap; }
`;

/** An address no route matches. */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  styles: STYLES,
  template: `
    <section class="status" data-testid="not-found">
      <p class="code" aria-hidden="true">404</p>
      <h1>Page not found</h1>
      <p>There is nothing at this address. The link may be old, or the page may have moved.</p>
      <div class="actions">
        <a class="btn btn-primary" [routerLink]="home()">{{
          session.isSignedIn() ? 'Go to your dashboard' : 'Go to sign in'
        }}</a>
        <a class="btn btn-secondary" routerLink="/help">Get help</a>
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
      <p class="code" aria-hidden="true">403</p>
      <h1>You can't open this page</h1>
      <p>
        Your account doesn't have access to it. If you think it should, contact support and say
        which page you were trying to reach.
      </p>
      <div class="actions">
        <a class="btn btn-primary" routerLink="/dashboard">Go to your dashboard</a>
        <a class="btn btn-secondary" routerLink="/help">Get help</a>
      </div>
    </section>
  `,
})
export class ForbiddenComponent {}

/** An unexpected failure that no screen handled itself. */
@Component({
  selector: 'app-error-page',
  imports: [RouterLink],
  styles: STYLES,
  template: `
    <section class="status" data-testid="error-page" role="alert">
      <p class="code" aria-hidden="true">Error</p>
      <h1>Something went wrong</h1>
      <p>
        That wasn't your doing, and nothing you entered was lost or sent twice. Try again, or go
        back to your dashboard.
      </p>
      <div class="actions">
        <button type="button" class="btn btn-primary" data-testid="error-retry" (click)="back()">
          Try again
        </button>
        <a class="btn btn-secondary" routerLink="/dashboard">Go to your dashboard</a>
      </div>
    </section>
  `,
})
export class ErrorPageComponent {
  private readonly router = inject(Router);
  protected back(): void {
    history.length > 1 ? history.back() : void this.router.navigateByUrl('/dashboard');
  }
}
