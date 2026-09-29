import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Session } from '../session/session';
import { mayCarryToken, TOKEN_ALLOW_LIST } from './token-allow-list';

/**
 * The only place in the application that sets an Authorization header.
 * Registered once, in app.config.ts. The token goes to the platform's own
 * protected routes and nowhere else: a bearer token sent to any other host
 * lands in that host's logs, and whoever reads them is the customer until it
 * expires.
 */
export const authTokenInterceptor: HttpInterceptorFn = (request, next) => {
  const token = inject(Session).accessToken();
  if (!token || !mayCarryToken(request.url, inject(TOKEN_ALLOW_LIST))) {
    return next(request);
  }
  return next(request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};
