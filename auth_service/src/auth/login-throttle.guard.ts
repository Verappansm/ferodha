import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { unauthorised } from '../common/error-envelope';
import { LoginAttemptLimiter } from './login-attempt-limiter';

/** The address a login attempt is counted against. */
export function clientIp(request: Request): string {
  return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
}

/**
 * Refuses a login from an IP that has used up its failed attempts, before any
 * password work is done. The answer is the same AUTH-401 envelope as every
 * other login failure, plus a Retry-After header saying when to come back.
 * Failures are recorded by AuthController after the login itself fails.
 */
@Injectable()
export class LoginThrottleGuard implements CanActivate {
  private readonly logger = new Logger(LoginThrottleGuard.name);

  constructor(private readonly limiter: LoginAttemptLimiter) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const ip = clientIp(http.getRequest<Request>());
    const retryAfter = this.limiter.retryAfterSeconds(ip);
    if (retryAfter === 0) {
      return true;
    }
    this.logger.warn(`Login refused: too many failed attempts from ${ip}`);
    http.getResponse<Response>().setHeader('Retry-After', String(retryAfter));
    throw unauthorised();
  }
}
