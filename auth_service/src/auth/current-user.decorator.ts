import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { unauthorised } from '../common/error-envelope';
import { AccessTokenClaims } from './access-token-claims';
import type { AuthenticatedRequest } from './jwt-auth.guard';

/**
 * The authenticated caller, exactly as JwtAuthGuard verified it from the token.
 *
 * Reads only `request.user`, which only the guard writes - never a header,
 * query parameter or body field the caller controls (OWASP A01). If a route
 * uses this decorator without the guard, there is no verified user: fail
 * closed with the same AUTH-401 rather than hand the handler `undefined`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessTokenClaims => {
    const request = context
      .switchToHttp()
      .getRequest<Partial<AuthenticatedRequest>>();

    if (!request.user) {
      throw unauthorised();
    }
    return request.user;
  },
);
