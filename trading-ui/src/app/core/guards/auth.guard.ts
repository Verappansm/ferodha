import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Session } from '../session/session';

/**
 * Validates that a return address is a same-origin path.
 * Rejects absolute URLs, off-origin URLs, and protocol-relative URLs.
 * Accepts only paths starting with /.
 */
function isValidReturnPath(returnUrl: string): boolean {
  // Must be a path starting with /
  if (!returnUrl.startsWith('/')) {
    return false;
  }

  // Reject double slashes (protocol-relative URLs like //attacker.com)
  if (returnUrl.startsWith('//')) {
    return false;
  }

  // Reject URLs with protocol (http://, https://, etc.)
  if (returnUrl.includes('://')) {
    return false;
  }

  return true;
}

/**
 * Guard that ensures only authenticated users can access routes.
 * Unauthenticated users are redirected to sign-in carrying where they were going.
 * The return address is validated to be same-origin; off-origin URLs are rejected.
 */
export const authGuard: CanActivateFn = (route, state) => {
  const session = inject(Session);
  const router = inject(Router);

  // User is authenticated, allow navigation
  if (session.isSignedIn()) {
    return true;
  }

  // User is not authenticated. Redirect to sign-in, carrying the intended destination.
  // Only include the return URL if it's a valid same-origin path.
  const returnUrl = isValidReturnPath(state.url) ? state.url : undefined;

  // Navigate to login with the return address if valid
  router.navigate(['/login'], {
    queryParams: returnUrl ? { returnUrl } : {},
    queryParamsHandling: 'merge',
  });

  return false;
};
