import { ConsoleLogger } from '@nestjs/common';
import { REDACTED, isSensitiveKey, redact } from './redact';
import { RedactingLogger } from './redacting-logger';

describe('redact', () => {
  it('redacts sensitive keys whatever their case or separators', () => {
    for (const key of [
      'password',
      'Password',
      'new_password',
      'currentPassword',
      'passwordHash',
      'refreshToken',
      'accessToken',
      'jwtSecret',
      'Authorization',
      'x-api-key',
      'cookie',
    ]) {
      expect(isSensitiveKey(key)).toBe(true);
    }
    for (const key of ['username', 'email', 'accountId', 'roles', 'id']) {
      expect(isSensitiveKey(key)).toBe(false);
    }
  });

  it('redacts at any depth, including inside arrays', () => {
    const input = {
      user: { email: 'a@example.com', credentials: { password: 'p' } },
      attempts: [{ password: 'p1' }, { nested: { deeper: { passwordHash: 'h' } } }],
    };

    expect(redact(input)).toEqual({
      user: { email: 'a@example.com', credentials: REDACTED },
      attempts: [{ password: REDACTED }, { nested: { deeper: { passwordHash: REDACTED } } }],
    });
  });

  it('never mutates the object it was given', () => {
    const body = { username: 'a@example.com', password: 'hunter2' };
    redact(body);
    expect(body.password).toBe('hunter2');
  });

  it('survives circular references', () => {
    const node: Record<string, unknown> = { password: 'p' };
    node.self = node;
    expect(redact(node)).toEqual({ password: REDACTED, self: '[Circular]' });
  });

  it('redacts properties attached to an Error', () => {
    const error = Object.assign(new Error('boom'), { password: 'p' });
    expect(redact(error)).toMatchObject({ message: 'boom', password: REDACTED });
  });
});

describe('RedactingLogger', () => {
  afterEach(() => jest.restoreAllMocks());

  it('passes only redacted values to the underlying logger', () => {
    const spy = jest
      .spyOn(ConsoleLogger.prototype, 'log')
      .mockImplementation(() => undefined);

    new RedactingLogger().log({ body: { password: 'hunter2' } }, 'AuthService');

    expect(JSON.stringify(spy.mock.calls)).not.toContain('hunter2');
    expect(spy).toHaveBeenCalledWith({ body: { password: REDACTED } }, 'AuthService');
  });
});
