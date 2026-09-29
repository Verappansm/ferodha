import { ConsoleLogger } from '@nestjs/common';
import { redact } from './redact';

/**
 * The one logger the service uses (installed in main.ts, so every
 * `new Logger(...)` in the code writes through it). Every argument of every
 * level goes through `redact` first, so a password, hash, token or secret
 * nested anywhere in a logged object prints as [REDACTED].
 *
 * Redaction is by key name, so it cannot see inside a plain string: build
 * log messages from ids, types and outcomes, never by interpolating request
 * data or an exception's message, and never pass a whole request body.
 */
export class RedactingLogger extends ConsoleLogger {
  log(message: unknown, ...rest: unknown[]): void {
    super.log(redact(message), ...rest.map(redact));
  }

  error(message: unknown, ...rest: unknown[]): void {
    super.error(redact(message), ...rest.map(redact));
  }

  warn(message: unknown, ...rest: unknown[]): void {
    super.warn(redact(message), ...rest.map(redact));
  }

  debug(message: unknown, ...rest: unknown[]): void {
    super.debug(redact(message), ...rest.map(redact));
  }

  verbose(message: unknown, ...rest: unknown[]): void {
    super.verbose(redact(message), ...rest.map(redact));
  }

  fatal(message: unknown, ...rest: unknown[]): void {
    super.fatal(redact(message), ...rest.map(redact));
  }
}
