import { HttpErrorResponse } from '@angular/common/http';
import { ErrorResponse as AuthAdminError } from '../../api/generated/auth/model/error-response';
import { ErrorResponse as TradeAdminError } from '../../api/generated/trade/model/error-response';

export type AdminErrorCode = AuthAdminError.ErrorCodeEnum | TradeAdminError.ErrorCodeEnum;

/**
 * One sentence per code in both admin catalogues. A full Record over the
 * generated enums, so a code added to a contract fails to compile here until
 * it has a sentence.
 */
export const ADMIN_ERROR_MESSAGES: Record<AdminErrorCode, string> = {
  'AUTH-401': 'Your admin session has ended. Sign in again to continue.',
  'AUTH-403': 'This sign-in does not have administrator rights for that action.',
  'VAL-422': 'Some of the details entered are not valid. Check them and try again.',
  'ADM-404': 'That record no longer exists. Refresh the list and try again.',
  'ADM-409':
    'That change does not apply any more: the record has changed since you loaded it. Refresh the list and try again.',
};

export const ADMIN_UNREACHABLE =
  'The platform services could not be reached. Check that they are running, then try again.';

export const ADMIN_FALLBACK =
  'Something went wrong on the server. Try again, and check the service logs if it continues.';

export function adminErrorMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) return ADMIN_FALLBACK;
  if (error.status === 0) return ADMIN_UNREACHABLE;
  const body: unknown = error.error;
  if (body && typeof body === 'object' && 'errorCode' in body) {
    const code = (body as { errorCode: unknown }).errorCode;
    // A refusal by a business rule carries `reason`, a sentence written for the
    // operator (why an approval cannot go ahead). `message` is never shown.
    const reason = (body as { reason?: unknown }).reason;
    if (code === 'ADM-409' && typeof reason === 'string' && reason.trim()) {
      return reason;
    }
    if (typeof code === 'string' && Object.hasOwn(ADMIN_ERROR_MESSAGES, code)) {
      return ADMIN_ERROR_MESSAGES[code as AdminErrorCode];
    }
  }
  return ADMIN_FALLBACK;
}
