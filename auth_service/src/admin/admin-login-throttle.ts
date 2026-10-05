import { Injectable } from '@nestjs/common';
import { LoginAttemptLimiter } from '../auth/login-attempt-limiter';
import { LoginThrottleGuard } from '../auth/login-throttle.guard';

/**
 * Admin sign-in keeps its own failed-attempt counts, separate from customer
 * sign-in: the same rule (5 failures per IP per 15 minutes), but a customer's
 * failed logins never lock an operator out, nor the other way round.
 */
@Injectable()
export class AdminLoginAttemptLimiter extends LoginAttemptLimiter {}

@Injectable()
export class AdminLoginThrottleGuard extends LoginThrottleGuard {
  constructor(limiter: AdminLoginAttemptLimiter) {
    super(limiter);
  }
}
