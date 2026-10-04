import { HttpErrorResponse } from '@angular/common/http';
import { ErrorResponse as AuthErrorResponse } from '../../api/generated/auth/model/error-response';
import { ErrorResponse as PortfolioErrorResponse } from '../../api/generated/portfolio/model/error-response';
import { ErrorResponse as ProfileErrorResponse } from '../../api/generated/profile/model/error-response';
import { ErrorResponse as TradeErrorResponse } from '../../api/generated/trade/model/error-response';

export type ErrorCode =
  | AuthErrorResponse.ErrorCodeEnum
  | TradeErrorResponse.ErrorCodeEnum
  | PortfolioErrorResponse.ErrorCodeEnum
  | ProfileErrorResponse.ErrorCodeEnum;

// One sentence per code. Typed as a full Record over `ErrorCode`, so a code must have a corresponding message.
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  'AUTH-401': 'Your session has ended. Sign in again to continue.',
  'AUTH-409':
    'An account with that email address already exists. Sign in or register with a different email address.',
  'VAL-422': 'Some of the details entered are not valid. Check them and try again.',
  'ACC-404':
    'Trading account not found. Sign out and sign in again, and contact support if it continues.',
  'ACC-403': 'Your account cannot trade right now. It may be suspended or closed. Contact support.',
  'INS-404': 'Instrument is not available to trade. Check the symbol and try again.',
  'ORD-400': 'Insufficient balance to place order.',
  // One code, three causes: too few units to sell, a reused idempotency key,
  // or an order that is no longer cancellable.
  'ORD-409':
    'This order cannot go ahead. If you are selling, check you hold enough units. If you were cancelling, the order may already be filled or cancelled, so refresh your orders.',
  'MKT-503':
    'Prices are unavailable right now, so your holdings cannot be valued. Trading is not affected. Try again in a few minutes.',
};

export const UNREACHABLE =
  'The trading service could not be reached. Check your connection, then try again.';

export const FALLBACK =
  'Something went wrong on our side. Try again, and contact support if it continues.';

export function errorMessage(
  error: unknown,
  overrides: Partial<Record<ErrorCode, string>> = {},
): string {
  if (!(error instanceof HttpErrorResponse)) return FALLBACK;
  // Status 0: the request never got an answer (service down, or a CORS rule
  // that does not allow this origin).
  if (error.status === 0) return UNREACHABLE;

  const code = errorCodeOf(error);
  if (code === 'AUTH-401' && error.headers.has('Retry-After')) {
    return tooManyAttempts(error.headers.get('Retry-After'));
  }
  if (!code) return FALLBACK;
  return overrides[code] ?? ERROR_MESSAGES[code];
}

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(ERROR_MESSAGES, value);
}

function errorCodeOf(error: HttpErrorResponse): ErrorCode | null {
  const body: unknown = error.error;
  if (body && typeof body === 'object' && 'errorCode' in body) {
    const code = (body as { errorCode: unknown }).errorCode;
    return isErrorCode(code) ? code : null;
  }
  return null;
}

/** The login throttle answers AUTH-401 with Retry-After in seconds. */
function tooManyAttempts(retryAfter: string | null): string {
  const minutes = Math.ceil(Number(retryAfter) / 60);
  const wait =
    Number.isFinite(minutes) && minutes > 0
      ? `${minutes} minute${minutes === 1 ? '' : 's'}`
      : 'a few minutes';
  return `Too many sign-in attempts. Wait ${wait}, then try again.`;
}
