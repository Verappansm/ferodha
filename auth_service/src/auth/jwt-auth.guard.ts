import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AppConfigService } from '../config/config.service';
import { unauthorised } from '../common/error-envelope';
import { AccessTokenClaims } from './access-token-claims';

/**
 * Protects /auth/me, as the contract marks it (bearer security): no valid
 * access token, no profile - 401 in the platform envelope.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const header = request.headers.authorization;
    const match =
      typeof header === 'string' ? /^Bearer (.+)$/i.exec(header.trim()) : null;
    if (!match) {
      throw unauthorised();
    }

    try {
      (request as AuthenticatedRequest).user =
        this.jwt.verify<AccessTokenClaims>(match[1], {
          secret: this.config.jwtSecret,
          algorithms: ['HS256'],
        });
    } catch {
      throw unauthorised();
    }
    return true;
  }
}

export interface AuthenticatedRequest extends Request {
  user: AccessTokenClaims;
}
