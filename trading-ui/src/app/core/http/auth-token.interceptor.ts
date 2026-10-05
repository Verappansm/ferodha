import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { Session } from '../session/session';
import { mayCarryToken, TOKEN_ALLOW_LIST } from './token-allow-list';

/**
 * The only place in the application that sets an Authorization header.
 * Registered once, in app.config.ts. The token goes to the platform's own
 * protected routes and nowhere else: a bearer token sent to any other host
 * lands in that host's logs, and whoever reads them is the customer until it
 * expires.
 *
 * It also keeps a signed-in session alive. An access token lasts 15 minutes:
 * one that is about to expire is renewed with the refresh token before the
 * request goes out, and a request still refused with 401 is renewed and
 * retried once. When the refresh token is refused too, the session is over:
 * the customer is signed out and sent to sign in, then back to where they were.
 */
export const authTokenInterceptor: HttpInterceptorFn = (request, next) => {
  const session = inject(Session);
  const router = inject(Router);
  if (!session.accessToken() || !mayCarryToken(request.url, inject(TOKEN_ALLOW_LIST))) {
    return next(request);
  }

  const withToken = (token: string | null): HttpRequest<unknown> =>
    token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;

  const send = () => {
    const sentWith = session.accessToken();
    return next(withToken(sentWith)).pipe(
      catchError((error: unknown) => {
        // Only a signed-in session's own token is renewed; the pending token
        // of a sign-in still in progress is not (Session.signIn handles that).
        if (
          !(error instanceof HttpErrorResponse) ||
          error.status !== 401 ||
          !session.isSignedIn()
        ) {
          return throwError(() => error);
        }
        // Another request may have renewed the token while this one was out.
        const renewed =
          session.accessToken() !== sentWith ? Promise.resolve(true) : session.refresh();
        return from(renewed).pipe(
          switchMap((ok) => {
            if (!ok) {
              sendToSignIn(router);
              return throwError(() => error);
            }
            return next(withToken(session.accessToken()));
          }),
        );
      }),
    );
  };

  if (session.isSignedIn() && session.accessTokenExpiring()) {
    return from(session.refresh()).pipe(
      switchMap((ok) => {
        if (!ok) {
          sendToSignIn(router);
          return next(request);
        }
        return send();
      }),
    );
  }
  return send();
};

/** Sends the customer to sign in, coming back to the page they were on. */
function sendToSignIn(router: Router): void {
  const current = router.url;
  if (current.startsWith('/login')) return;
  void router.navigate(['/login'], {
    queryParams: current && current !== '/' ? { returnUrl: current } : {},
  });
}
