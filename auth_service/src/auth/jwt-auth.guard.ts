import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AppConfigService } from '../config/config.service';
import { unauthorised } from '../common/error-envelope';
import { AccessTokenClaims } from './access-token-claims';

/**
 * The gate on protected routes (/auth/me).
 *
 * Order matters and is deliberate:
 *   1. the header must be exactly `Authorization: Bearer <token>`;
 *   2. the signature is verified (HS256 only - `none` and every other
 *      algorithm are refused) AND the expiry is checked, in one call;
 *   3. only then is any claim read, and the claim set is re-checked against
 *      the contract's shape rather than trusted because the signature held.
 *
 * A guard that checked the signature but not the clock would accept every
 * token the service ever issued, for ever - so `exp` is always enforced.
 *
 * Every failure is the same AUTH-401: which check failed is not the caller's
 * business. The caller's identity comes only from the verified token, never
 * from anything else in the request (OWASP A01).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const claims = this.verify(this.extract(request));
    (request as AuthenticatedRequest).user = claims;
    return true;
  }

  /** `Authorization: Bearer <token>` and nothing else. */
  private extract(request: Request): string {
    const header = request.headers.authorization;
    const match =
      typeof header === 'string' ? /^Bearer (.+)$/i.exec(header.trim()) : null;
    if (!match) {
      throw unauthorised();
    }
    return match[1];
  }

  /** Signature and expiry first; no claim is looked at until both pass. */
  private verify(token: string): AccessTokenClaims {
    let claims: unknown;
    try {
      claims = this.jwt.verify(token, {
        secret: this.config.jwtSecret,
        algorithms: ['HS256'],
      });
    } catch {
      // Expired, wrong signature, malformed: one answer for all of them.
      throw unauthorised();
    }

    if (!hasValidClaims(claims)) {
      throw unauthorised();
    }
    return claims;
  }
}

export interface AuthenticatedRequest extends Request {
  user: AccessTokenClaims;
}

/**
 * The contract's claim set, re-asserted after verification. A correctly
 * signed token with a missing `accountId` or an empty `roles` would break
 * the Trade REST API's authorisation check downstream, so it is refused here.
 */
function hasValidClaims(payload: unknown): payload is AccessTokenClaims {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const claims = payload as Record<string, unknown>;
  return (
    typeof claims.sub === 'string' &&
    claims.sub.length > 0 &&
    typeof claims.accountId === 'number' &&
    Number.isInteger(claims.accountId) &&
    Array.isArray(claims.roles) &&
    claims.roles.length > 0 &&
    claims.roles.every((role) => typeof role === 'string') &&
    typeof claims.iat === 'number' &&
    typeof claims.exp === 'number' &&
    typeof claims.iss === 'string'
  );
}