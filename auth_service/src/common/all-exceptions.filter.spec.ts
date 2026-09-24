/**
 * Indirect log leaks: an error message that quotes a credential, a stack
 * trace (whose first line IS the message), a validation error carrying the
 * submitted DTO, a 404 whose message quotes a URL with a token in it. None
 * of them may reach a log line; all of them still leave as the envelope.
 */
import { ArgumentsHost, Logger, NotFoundException } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { unauthorised } from './error-envelope';
import { ValidationException } from './validation.exception';

const SECRET = 'hunter2-super-secret-value';

function hostWithResponse() {
  const response = {
    headersSent: false,
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

function everythingLogged(): string {
  const calls = [
    ...(Logger.prototype.error as jest.Mock).mock.calls,
    ...(Logger.prototype.warn as jest.Mock).mock.calls,
    ...(Logger.prototype.log as jest.Mock).mock.calls,
  ];
  return JSON.stringify(calls);
}

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('AllExceptionsFilter logging', () => {
  it('logs neither the message nor the stack header of an unexpected error', () => {
    const { host, response } = hostWithResponse();
    const error = new Error(`login failed, password=${SECRET}`);

    new AllExceptionsFilter().catch(error, host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      errorCode: 'INTERNAL-500',
      message: 'An unexpected error occurred',
    });
    const logged = everythingLogged();
    expect(logged).not.toContain(SECRET);
    expect(logged).toContain('Unhandled exception (Error)');
    expect(logged).toContain(' at '); // the frames are still there to debug with
  });

  it('logs constraint names, not the submitted value, on a validation failure', () => {
    const { host, response } = hostWithResponse();
    const failure = Object.assign(new ValidationError(), {
      property: 'password',
      value: SECRET,
      target: { username: 'a@example.com', password: SECRET },
      constraints: { minLength: 'password must be longer than or equal to 12 characters' },
      children: [],
    });

    new AllExceptionsFilter().catch(new ValidationException([failure]), host);

    expect(response.status).toHaveBeenCalledWith(422);
    const logged = everythingLogged();
    expect(logged).not.toContain(SECRET);
    expect(logged).toContain('minLength');
  });

  it('does not log the URL a 404 message quotes', () => {
    const { host, response } = hostWithResponse();

    new AllExceptionsFilter().catch(
      new NotFoundException(`Cannot GET /auth/me?refreshToken=${SECRET}`),
      host,
    );

    expect(response.status).toHaveBeenCalledWith(404);
    expect(everythingLogged()).not.toContain(SECRET);
  });

  it('answers an authentication failure with the envelope and logs only its code', () => {
    const { host, response } = hostWithResponse();

    new AllExceptionsFilter().catch(unauthorised(), host);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(response.json).toHaveBeenCalledWith({
      errorCode: 'AUTH-401',
      message: 'Unauthorised',
    });
    expect(everythingLogged()).toContain('401 AUTH-401');
  });
});
