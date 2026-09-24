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
 * exactly `{ errorCode, message }` and nothing else. Detail that an
 * investigation needs is logged server-side, from the exception's own type,
 * never from a request body: this service handles passwords and refresh
 * tokens, and none of those may appear in a log line or an error object.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) {
      return;
    }

    const { status, body, detail } = this.describe(exception);

    if (status >= 500) {
      // The message of an unexpected exception may quote whatever it was
      // holding - including credentials - so only its type goes to the log.
      this.logger.error(
        `Unhandled exception (${exception instanceof Error ? exception.name : typeof exception})`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else if (exception instanceof ValidationException) {
      // Constraint names and constraints only: class-validator messages
      // describe the rule ("password must be longer than 12 characters"),
      // never the submitted value.
      this.logger.warn(
        `Request failed field validation: ${JSON.stringify(
          this.constraintsOf(exception.validationErrors),
        )}`,
      );
    } else if (detail) {
      this.logger.warn(`${status} ${detail}`);
    }

    response.status(status).json(body);
  }

  private describe(exception: unknown): {
    status: number;
    body: unknown;
    detail?: string;
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
          detail: exception.message,
        };
      }

      // Some other HttpException (404 from an unknown path, 405 from the
      // wrong verb, ...): keep its status, replace its body with the envelope.
      return {
        status,
        body: envelopeForStatus(status),
        detail: exception.message,
      };
    }

    // Anything that is not an HttpException reached the boundary: a database
    // failure, a null dereference. Still the envelope, still no internals.
    return { status: 500, body: envelopeForStatus(500) };
  }

  private constraintsOf(errors: ValidationError[]): Record<string, string[]> {
    const constraints: Record<string, string[]> = {};
    for (const error of errors) {
      if (error.constraints) {
        constraints[error.property] = Object.values(error.constraints);
      }
      if (error.children?.length) {
        Object.assign(constraints, this.constraintsOf(error.children));
      }
    }
    return constraints;
  }
}
