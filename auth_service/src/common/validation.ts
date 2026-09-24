import { ValidationPipe } from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { ValidationException } from './validation.exception';

/**
 * The one ValidationPipe the whole application runs, registered as an
 * APP_PIPE provider in AppModule so that *every* way of building the app -
 * main.ts, a test that mounts AppModule itself - gets it.
 *
 * - `transform` turns the JSON body into the DTO class through
 *   class-transformer, which is what makes class-validator's decorators see a
 *   typed object rather than a plain dictionary.
 * - `whitelist` + `forbidNonWhitelisted` enforce the contract's
 *   `additionalProperties: false`: a body with a field the schema does not
 *   declare (a smuggled `isAdmin`, say) is a VAL-422, not a silently ignored
 *   extra property.
 * - No `enableImplicitConversion`: `"accountId": "1"` is a string where the
 *   contract wants an integer, and silently coercing it would accept input the
 *   schema refuses.
 * - The exceptionFactory raises ValidationException so the response is the
 *   platform envelope rather than Nest's default 400 body.
 *
 * There is no implicit conversion: type mismatches are field failures, which
 * the contract answers with VAL-422.
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors: ValidationError[]) =>
      new ValidationException(errors),
  });
}
