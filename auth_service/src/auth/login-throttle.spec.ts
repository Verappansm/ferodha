/**
 * The login throttle: 5 failed attempts per IP within 15 minutes, then that
 * IP is refused until the window ends. Only failures count.
 */
import { ExecutionContext, HttpException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginAttemptLimiter } from './login-attempt-limiter';
import { LoginThrottleGuard } from './login-throttle.guard';
import { unauthorised } from '../common/error-envelope';

const IP = '203.0.113.7';
const OTHER_IP = '198.51.100.4';
const CREDENTIALS = { username: 'user@example.com', password: 'whatever' };

let now: number;
beforeEach(() => {
  now = Date.parse('2026-09-28T10:00:00.000Z');
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => jest.restoreAllMocks());

function contextFor(ip: string) {
  const headers: Record<string, string> = {};
  const response = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ ip }),
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { context, headers };
}

function controllerWith(login: () => Promise<unknown>) {
  const limiter = new LoginAttemptLimiter();
  const controller = new AuthController(
    { login } as unknown as AuthService,
    limiter,
  );
  const attempt = (ip: string) =>
    controller
      .login(CREDENTIALS, { ip } as Request)
      .catch((error: unknown) => error);
  return { limiter, guard: new LoginThrottleGuard(limiter), attempt };
}

describe('login throttle', () => {
  it('limits repeated failed attempts from one IP', async () => {
    const { guard, attempt } = controllerWith(() =>
      Promise.reject(unauthorised()),
    );

    for (let i = 0; i < LoginAttemptLimiter.MAX_FAILURES; i++) {
      expect(guard.canActivate(contextFor(IP).context)).toBe(true);
      await attempt(IP);
    }

    const { context, headers } = contextFor(IP);
    expect(() => guard.canActivate(context)).toThrow(HttpException);
    expect(headers['Retry-After']).toBe('900');
  });

  it('answers a throttled IP with the same AUTH-401 envelope', async () => {
    const { guard, attempt } = controllerWith(() =>
      Promise.reject(unauthorised()),
    );
    for (let i = 0; i < LoginAttemptLimiter.MAX_FAILURES; i++) {
      await attempt(IP);
    }

    let thrown: unknown;
    try {
      guard.canActivate(contextFor(IP).context);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as HttpException).getStatus()).toBe(401);
    expect((thrown as HttpException).getResponse()).toEqual({
      errorCode: 'AUTH-401',
      message: 'Unauthorised',
    });
  });

  it('counts per IP: another address is not affected', async () => {
    const { guard, attempt } = controllerWith(() =>
      Promise.reject(unauthorised()),
    );
    for (let i = 0; i < LoginAttemptLimiter.MAX_FAILURES; i++) {
      await attempt(IP);
    }
    expect(guard.canActivate(contextFor(OTHER_IP).context)).toBe(true);
  });

  it('does not count successful logins', async () => {
    const { limiter, attempt } = controllerWith(() =>
      Promise.resolve({ tokenType: 'Bearer' }),
    );
    for (let i = 0; i < LoginAttemptLimiter.MAX_FAILURES * 2; i++) {
      await attempt(IP);
    }
    expect(limiter.retryAfterSeconds(IP)).toBe(0);
  });

  it('does not count a server error as a failed guess', async () => {
    const { limiter, attempt } = controllerWith(() =>
      Promise.reject(new Error('database down')),
    );
    for (let i = 0; i < LoginAttemptLimiter.MAX_FAILURES; i++) {
      await attempt(IP);
    }
    expect(limiter.retryAfterSeconds(IP)).toBe(0);
  });

  it('lets the IP try again once 15 minutes have passed since its first failure', async () => {
    const { limiter, attempt } = controllerWith(() =>
      Promise.reject(unauthorised()),
    );
    for (let i = 0; i < LoginAttemptLimiter.MAX_FAILURES; i++) {
      await attempt(IP);
    }
    now += LoginAttemptLimiter.WINDOW_MS - 1000;
    expect(limiter.retryAfterSeconds(IP)).toBe(1);

    now += 1000;
    expect(limiter.retryAfterSeconds(IP)).toBe(0);
  });
});
