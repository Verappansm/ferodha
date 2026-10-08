import { HttpErrorResponse } from '@angular/common/http';
import { ErrorResponse as AuthAdminError } from '../../api/generated/auth/model/error-response';
import { ErrorResponse as TradeAdminError } from '../../api/generated/trade/model/error-response';
import {
  ADMIN_ERROR_MESSAGES,
  ADMIN_FALLBACK,
  ADMIN_UNREACHABLE,
  adminErrorMessage,
} from './admin-error-message';

describe('adminErrorMessage', () => {
  // Read from the generated enums, so a new code in either admin contract
  // lands in this list without anybody editing the test.
  const catalogue = [
    ...Object.values(AuthAdminError.ErrorCodeEnum),
    ...Object.values(TradeAdminError.ErrorCodeEnum),
  ];

  it.each(catalogue)('every code in both admin catalogues maps to a message: %s', (code) => {
    const sentence = adminErrorMessage(
      new HttpErrorResponse({ status: 400, error: { errorCode: code, message: 'dev text' } }),
    );
    expect(sentence).toBe(ADMIN_ERROR_MESSAGES[code]);
    expect(sentence).not.toBe('dev text');
  });

  it('holds no sentence for a code outside the catalogues', () => {
    expect(Object.keys(ADMIN_ERROR_MESSAGES).sort()).toEqual([...new Set(catalogue)].sort());
  });

  it('an unrecognised code falls back to a readable sentence', () => {
    const error = new HttpErrorResponse({
      status: 418,
      error: { errorCode: 'XYZ-1', message: 'x' },
    });
    expect(adminErrorMessage(error)).toBe(ADMIN_FALLBACK);
  });

  it('a request that never reached a service renders a readable sentence', () => {
    expect(adminErrorMessage(new HttpErrorResponse({ status: 0 }))).toBe(ADMIN_UNREACHABLE);
  });

  it('shows the reason a business rule gives for a refusal, and the catalogue line for a bare conflict', () => {
    const refusal = new HttpErrorResponse({
      status: 409,
      error: {
        errorCode: 'ADM-409',
        message: 'Conflict',
        reason: 'The bank holds no account under a@b.com.',
      },
    });
    expect(adminErrorMessage(refusal)).toBe('The bank holds no account under a@b.com.');
    const bare = new HttpErrorResponse({
      status: 409,
      error: { errorCode: 'ADM-409', message: 'Conflict' },
    });
    expect(adminErrorMessage(bare)).toBe(ADMIN_ERROR_MESSAGES['ADM-409']);
  });
});
