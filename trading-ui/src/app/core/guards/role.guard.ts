import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Session } from '../session/session';

/**
 * Sends a signed-in user whose role is not `role` to the forbidden page (LEAP-025).
 * Used after authGuard, which has already handled the signed-out visitor. A
 * usability control, not a security one: every protected route on the backend
 * checks the role in the token itself.
 */
export function roleGuard(role: string): CanActivateFn {
  return () => {
    const session = inject(Session);
    if (session.roles().includes(role)) {
      return true;
    }
    return inject(Router).createUrlTree(['/forbidden']);
  };
}
