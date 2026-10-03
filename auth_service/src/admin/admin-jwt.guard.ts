import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JWT_ISSUER } from '../auth/auth.service';
import { forbidden, unauthorised } from '../common/error-envelope';
import { AppConfigService } from '../config/config.service';

export const ADMIN_AUDIENCE = 'admin-console';
export const ADMIN_ROLE = 'ADMIN';

/** What a verified admin console token proves. */
export interface AdminClaims {
  sub: string;
  roles: string[];
}

export interface AdminRequest extends Request {
  admin: AdminClaims;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The gate on /admin/**. Signature (HS256 only), expiry and issuer first; a
 * token failing any of those is AUTH-401, whatever it claims. A genuine token
 * without the admin-console audience and the ADMIN role - a customer token -
 * is AUTH-403. The operator's identity comes only from the verified token.
 */
@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const header = request.headers.authorization;
    const match =
      typeof header === 'string' ? /^Bearer (.+)$/i.exec(header.trim()) : null;
    if (!match) {
      throw unauthorised();
    }

    let payload: Record<string, unknown>;
    try {
      payload = this.jwt.verify<Record<string, unknown>>(match[1], {
        secret: this.config.jwtSecret,
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
      });
    } catch {
      throw unauthorised();
    }

    const audience = payload.aud;
    const audiences = Array.isArray(audience) ? audience : [audience];
    const roles = Array.isArray(payload.roles) ? payload.roles : [];
    if (!audiences.includes(ADMIN_AUDIENCE) || !roles.includes(ADMIN_ROLE)) {
      throw forbidden();
    }
    if (typeof payload.sub !== 'string' || !UUID.test(payload.sub)) {
      throw unauthorised();
    }

    request.admin = { sub: payload.sub, roles: roles as string[] };
    return true;
  }
}
