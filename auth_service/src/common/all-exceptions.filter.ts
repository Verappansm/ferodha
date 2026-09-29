import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ValidationError } from 'class-validator';
import {
  ErrorEnvelope,
  envelopeForStatus,
  isErrorEnvelope,
  normaliseStatus,
} from './error-envelope';
import { ValidationException } from './validation.exception';

/**
 * The single exit point for every failure in this service.
 *
 * Whatever throws - an HttpException we raised on purpose, the
 * ValidationPipe's field failures, a Postgres error, a bug - the caller sees
 * exactly `{ errorCode, message }` and nothing else.
 *
 * What goes to the log is built only from things that cannot carry a
 * credential: the status, the envelope's errorCode, the exception's type, the
 * stack FRAMES, and class-validator constraint names. Never an exception's
 * message (a driver error can quote the value it choked on; Nest's 404
 * message quotes the full URL, query string included), never a request body,
 * never the exception object itself.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) {
      return;
    }

    const { status, body } = this.describe(exception);

    if (status >= 500) {
      this.logger.error(
        `Unhandled exception (${typeOf(exception)})`,
        stackFramesOf(exception),
      );
    } else if (exception instanceof ValidationException) {
      // Constraint names and rule texts only: class-validator's default
      // messages describe the rule, never the submitted value.
      this.logger.warn(
        `Request failed field validation: ${JSON.stringify(
          this.constraintsOf(exception.validationErrors),
        )}`,
      );
    } else {
      this.logger.warn(`${status} ${body.errorCode} (${typeOf(exception)})`);
    }

    response.status(status).json(body);
  }

  private describe(exception: unknown): {
    status: number;
    body: ErrorEnvelope;
  } {
    if (exception instanceof HttpException) {
      const status = normaliseStatus(exception.getStatus());
      const payload = exception.getResponse();
      const object =
        typeof payload === 'string' ? { message: payload } : payload;

      // Already an envelope (raised by us, or by ValidationException) - send
      // it verbatim so the contract-fixed message survives.
      if (isErrorEnvelope(object)) {
        return {
          status,
          body: { errorCode: object.errorCode, message: object.message },
        };
      }

      // Some other HttpException (404 from an unknown path, 405 from the
      // wrong verb, ...): keep its status, replace its body with the envelope.
      return { status, body: envelopeForStatus(status) };
    }

    // Anything that is not an HttpException reached the boundary: a database
    // failure, a null dereference. Still the envelope, still no internals.
    return { status: 500, body: envelopeForStatus(500) };
  }

  private constraintsOf(
    errors: ValidationError[],
    prefix = '',
  ): Record<string, string[]> {
    const constraints: Record<string, string[]> = {};
    for (const error of errors) {
      const path = prefix ? `${prefix}.${error.property}` : error.property;
      if (error.constraints) {
        constraints[path] = Object.keys(error.constraints);
      }
      if (error.children?.length) {
        Object.assign(constraints, this.constraintsOf(error.children, path));
      }
    }
    return constraints;
  }
}

function typeOf(exception: unknown): string {
  return exception instanceof Error ? exception.name : typeof exception;
}

/**
 * The `at ...` lines of a stack, without its first line. `error.stack`
 * starts with "Name: message", so logging the stack whole would log the
 * message after all - the indirect route this filter exists to close.
 */
function stackFramesOf(exception: unknown): string | undefined {
  if (!(exception instanceof Error) || !exception.stack) {
    return undefined;
  }
  const frames = exception.stack
    .split('\n')
    .filter((line) => /^\s+at\s/.test(line));
  return frames.length ? frames.join('\n') : undefined;
}
