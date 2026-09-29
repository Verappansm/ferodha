import type { TransformFnParams } from 'class-transformer';

/**
 * Emails are compared case-insensitively everywhere in this service, so they
 * are trimmed and lower-cased before validation. Anything that is not a string
 * is passed through untouched for the validators to refuse.
 */
export function normaliseEmail({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}
