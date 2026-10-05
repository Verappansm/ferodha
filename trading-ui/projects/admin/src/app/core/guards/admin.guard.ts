import { inject, InjectionToken } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AdminSession } from '../session/admin-session';

/** Whether the console's routes need an admin sign-in; see environment.ts. */
export const REQUIRE_ADMIN_SIGN_IN = new InjectionToken<boolean>('REQUIRE_ADMIN_SIGN_IN', {
  providedIn: 'root',
  factory: () => environment.requireSignIn,
});

/**
 * Sends a visitor without an admin session to the console's sign-in page.
 * A usability control, not a security control: every admin route on the
 * backend refuses a request without an ADMIN token.
 */
export const adminGuard: CanActivateFn = (_route, state) => {
  if (!inject(REQUIRE_ADMIN_SIGN_IN) || inject(AdminSession).isSignedIn()) {
    return true;
  }
  return inject(Router).createUrlTree(['/sign-in'], {
    queryParams: { returnUrl: state.url },
  });
};

/** A return address is followed only when it is a path inside the console. */
export function safeReturnUrl(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/';
  }
  return value;
}
