import { HttpErrorResponse } from '@angular/common/http';

/**
 * Turns a failed call into a sentence a trader can act on. Branches on the
 * contract's `errorCode`, never on its `message`, which is written for a
 * developer and changes without notice.
 *
 * This starts with the codes sign-in can meet; Story 7 extends it to every
 * code in both catalogues.
 */
const MESSAGES: Record<string, string> = {
  // Wrong email, wrong password and an account still awaiting approval all
  // answer the same AUTH-401 on purpose, so the sentence covers all three.
  'AUTH-401':
    'That email and password did not sign you in. Check them and try again. A new account can sign in once an administrator has approved it.',
  'VAL-422': 'Some of the details entered are not valid. Check them and try again.',
};

const UNREACHABLE =
  'The trading service could not be reached. Check your connection, then try again in a moment.';

const FALLBACK =
  'Something went wrong on our side. Try again, and contact support if it keeps happening.';

export function errorMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) return FALLBACK;
  // Status 0: the request never got an answer (service down, or a CORS rule
  // that does not allow this origin).
  if (error.status === 0) return UNREACHABLE;

  const code = errorCodeOf(error);
  if (code === 'AUTH-401' && error.headers.has('Retry-After')) {
    return tooManyAttempts(error.headers.get('Retry-After'));
  }
  return (code && MESSAGES[code]) || FALLBACK;
}

function errorCodeOf(error: HttpErrorResponse): string | null {
  const body: unknown = error.error;
  if (body && typeof body === 'object' && 'errorCode' in body) {
    const code = (body as { errorCode: unknown }).errorCode;
    return typeof code === 'string' ? code : null;
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
