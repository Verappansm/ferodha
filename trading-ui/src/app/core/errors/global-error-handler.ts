import { HttpErrorResponse } from '@angular/common/http';
import { ErrorHandler, inject, Injectable, Injector } from '@angular/core';
import { Router } from '@angular/router';

/**
 * Anything nobody caught (LEAP-025): log it, and show the error page with a way
 * back, instead of leaving a half-drawn screen. Two kinds are left alone:
 * - an HTTP failure, because each screen already shows its own message for those
 *   (and AUTH-401 sends the user to sign in);
 * - any failure while the error page is already showing, so it can never loop.
 * The Router is looked up lazily: the handler is created before the router is.
 */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly injector = inject(Injector);

  handleError(error: unknown): void {
    console.error(error);
    if (error instanceof HttpErrorResponse) {
      return;
    }
    const router = this.injector.get(Router);
    if (router.url.startsWith('/error')) {
      return;
    }
    void router.navigateByUrl('/error');
  }
}
