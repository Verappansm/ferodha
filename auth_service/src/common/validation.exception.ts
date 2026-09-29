import { HttpException, HttpStatus } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { ErrorCode, INVALID_INPUT } from './error-envelope';

/**
 * Raised by the global ValidationPipe when class-validator rejects a field.
 *
 * The wire body is the plain VAL-422 envelope; the class-validator tree rides
 * along on the exception object only, so the filter can log *which constraint*
 * failed without any submitted value ever reaching the response or the log.
 */
export class ValidationException extends HttpException {
  constructor(public readonly validationErrors: ValidationError[]) {
    super(
      { errorCode: ErrorCode.InvalidInput, message: INVALID_INPUT },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
