import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * The platform error envelope from contracts/auth-api.yaml - the exact same
 * shape trade_api's ErrorResponseDto uses, so the Angular UI keeps one error
 * handler across both services.
 *
 * Every failure this service can produce, including ones that reach us by
 * accident (a body Express could not parse, a route that does not exist, a bug
 * nobody has hit yet), leaves as this object and nothing else. No stack trace,
 * no field values, no internal identifier.
 */
export enum ErrorCode {
  Unauthorised = 'AUTH-401',
  Conflict = 'AUTH-409',
  // The password was right, but an admin forced a reset (LEAP-016).
  PasswordChangeRequired = 'AUTH-428',
  InvalidInput = 'VAL-422',
  Internal = 'INTERNAL-500',
  // The admin routes' extra codes (contracts/admin-auth-api.yaml).
  Forbidden = 'AUTH-403',
  AdminNotFound = 'ADM-404',
  AdminConflict = 'ADM-409',
}

export interface ErrorEnvelope {
  readonly errorCode: ErrorCode;
  readonly message: string;
}

/**
 * The contract allows exactly two messages on a failure path here. Being
 * helpful is the bug: "no such user" versus "wrong password" tells an attacker
 * which half of the credential pair to keep working on.
 */
export const UNAUTHORISED = 'Unauthorised';
export const REGISTRATION_FAILED = 'Registration failed';
export const INVALID_INPUT = 'Invalid input';
export const UNEXPECTED_ERROR = 'An unexpected error occurred';
export const FORBIDDEN = 'Forbidden';

/**
 * Derives the envelope for an HTTP status that arrived without one - an
 * Express-level failure (malformed JSON), a Nest-built 404/405, anything that
 * never reached a handler that could set the body itself.
 *
 * 404 lands on VAL-422 on purpose: the catalogue has no "not found" code for
 * this service, and an unknown path is an invalid request. What matters is
 * that the body stays inside the catalogue and inside the envelope.
 */
export function envelopeForStatus(status: HttpStatus): ErrorEnvelope {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return { errorCode: ErrorCode.Unauthorised, message: UNAUTHORISED };
    case HttpStatus.FORBIDDEN:
      return { errorCode: ErrorCode.Forbidden, message: FORBIDDEN };
    case HttpStatus.CONFLICT:
      return { errorCode: ErrorCode.Conflict, message: REGISTRATION_FAILED };
    case HttpStatus.BAD_REQUEST:
    case HttpStatus.NOT_FOUND:
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return { errorCode: ErrorCode.InvalidInput, message: INVALID_INPUT };
    default:
      return { errorCode: ErrorCode.Internal, message: UNEXPECTED_ERROR };
  }
}

/**
 * A request the transport could not read - a body that is not JSON at all -
 * reaches the exception layer as a 400, but the platform catalogue has one
 * code for "this request was malformed" and it is VAL-422, at 422 (trade_api's
 * handler maps the same failure the same way). Everything else keeps the
 * status it was raised with.
 */
export function normaliseStatus(status: HttpStatus): number {
  return status === HttpStatus.BAD_REQUEST
    ? HttpStatus.UNPROCESSABLE_ENTITY
    : status;
}

export function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as { errorCode?: unknown; message?: unknown };
  return (
    typeof candidate.errorCode === 'string' &&
    typeof candidate.message === 'string'
  );
}

/** The body every authentication failure sends, whatever its cause. */
export function unauthorised(): HttpException {
  return new HttpException(
    { errorCode: ErrorCode.Unauthorised, message: UNAUTHORISED },
    HttpStatus.UNAUTHORIZED,
  );
}

/**
 * The credentials were right, but an administrator forced a password reset:
 * no session until POST /auth/change-password. Only ever sent after the
 * password checked out, so it says nothing to someone guessing.
 */
export function passwordChangeRequired(): HttpException {
  return new HttpException(
    {
      errorCode: ErrorCode.PasswordChangeRequired,
      message: 'Password change required',
    },
    HttpStatus.PRECONDITION_REQUIRED,
  );
}

/** Username already taken. The message is contract-fixed ("Registration failed"). */
export function registrationConflict(): HttpException {
  return new HttpException(
    { errorCode: ErrorCode.Conflict, message: REGISTRATION_FAILED },
    HttpStatus.CONFLICT,
  );
}

/** A field-level failure: class-validator said no. */
export function invalidInput(): HttpException {
  return new HttpException(
    { errorCode: ErrorCode.InvalidInput, message: INVALID_INPUT },
    HttpStatus.UNPROCESSABLE_ENTITY,
  );
}

/** A genuine token that is not an admin token, on an admin route. */
export function forbidden(): HttpException {
  return new HttpException(
    { errorCode: ErrorCode.Forbidden, message: FORBIDDEN },
    HttpStatus.FORBIDDEN,
  );
}

/** The user an admin action names does not exist. */
export function adminNotFound(): HttpException {
  return new HttpException(
    { errorCode: ErrorCode.AdminNotFound, message: 'Not found' },
    HttpStatus.NOT_FOUND,
  );
}

/** The user's state does not allow the admin action (or it is the admin themself). */
export function adminConflict(): HttpException {
  return new HttpException(
    { errorCode: ErrorCode.AdminConflict, message: 'Conflict' },
    HttpStatus.CONFLICT,
  );
}
