import { Injectable } from '@nestjs/common';

interface FailureWindow {
  count: number;
  resetsAt: number;
}

/**
 * Counts failed logins per client IP: 5 failures within 15 minutes and that
 * IP is refused until the 15 minutes, counted from its first failure, are up.
 *
 * Only failures count. A successful login neither counts nor resets the
 * window, so an attacker who owns one valid account cannot clear the counter
 * between guesses at somebody else's.
 *
 * The counts live in this process's memory: two instances behind a load
 * balancer each keep their own, and a restart clears them. Moving them to a
 * shared store (Redis) is the change that would fix both.
 */
@Injectable()
export class LoginAttemptLimiter {
  static readonly MAX_FAILURES = 5;
  static readonly WINDOW_MS = 15 * 60 * 1000;

  /** Above this many tracked IPs, expired windows are swept on write. */
  private static readonly SWEEP_ABOVE = 10_000;

  private readonly windows = new Map<string, FailureWindow>();

  /** Seconds this IP must wait before trying again, or 0 if it may try now. */
  retryAfterSeconds(ip: string): number {
    const window = this.windows.get(ip);
    const now = Date.now();
    if (!window || now >= window.resetsAt) {
      return 0;
    }
    if (window.count < LoginAttemptLimiter.MAX_FAILURES) {
      return 0;
    }
    return Math.ceil((window.resetsAt - now) / 1000);
  }

  recordFailure(ip: string): void {
    const now = Date.now();
    const window = this.windows.get(ip);
    if (!window || now >= window.resetsAt) {
      this.windows.set(ip, {
        count: 1,
        resetsAt: now + LoginAttemptLimiter.WINDOW_MS,
      });
      this.sweepIfLarge(now);
      return;
    }
    window.count += 1;
  }

  private sweepIfLarge(now: number): void {
    if (this.windows.size <= LoginAttemptLimiter.SWEEP_ABOVE) {
      return;
    }
    for (const [ip, window] of this.windows) {
      if (now >= window.resetsAt) {
        this.windows.delete(ip);
      }
    }
  }
}
