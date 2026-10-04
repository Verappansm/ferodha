import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { ErrorResponse as AuthErrorResponse } from '../../api/generated/auth/model/error-response';
import { ErrorResponse as PortfolioErrorResponse } from '../../api/generated/portfolio/model/error-response';
import { ErrorResponse as TradeErrorResponse } from '../../api/generated/trade/model/error-response';
import { ERROR_MESSAGES, errorMessage, FALLBACK, UNREACHABLE } from './error-message';

function failure(
  status: number,
  errorCode: unknown,
  message = 'developer text',
): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { errorCode, message } });
}

describe('errorMessage', () => {
  // Read from the generated enums, so a regenerated client with a new code
  // lands in this list without anybody editing the test.
  const catalogue = [
    ...Object.values(AuthErrorResponse.ErrorCodeEnum),
    ...Object.values(TradeErrorResponse.ErrorCodeEnum),
    ...Object.values(PortfolioErrorResponse.ErrorCodeEnum),
  ];

  it.each(catalogue)('every code in every catalogue maps to a message: %s', (code) => {
    const sentence = errorMessage(failure(400, code));

    expect(sentence).toBe(ERROR_MESSAGES[code]);
    expect(sentence.trim()).not.toBe('');
    expect(sentence).not.toBe(FALLBACK);
    expect(sentence).not.toBe('developer text');
  });

  it('the mapping holds no sentence for a code outside the catalogues', () => {
    expect(Object.keys(ERROR_MESSAGES).sort()).toEqual([...new Set(catalogue)].sort());
  });

  it('branches on the code, not on the message', () => {
    const a = errorMessage(failure(409, 'ORD-409', 'Insufficient holdings'));
    const b = errorMessage(failure(409, 'ORD-409', 'Duplicate order'));

    expect(a).toBe(b);
  });

  it('an unrecognised code falls back to a readable sentence', () => {
    expect(errorMessage(failure(418, 'XYZ-999', 'Teapot'))).toBe(FALLBACK);
  });

  it('a body without an error code falls back to a readable sentence', () => {
    expect(
      errorMessage(new HttpErrorResponse({ status: 502, error: '<html>Bad gateway</html>' })),
    ).toBe(FALLBACK);
    expect(errorMessage(new HttpErrorResponse({ status: 500, error: null }))).toBe(FALLBACK);
  });

  it('something other than an HTTP failure falls back to a readable sentence', () => {
    expect(errorMessage(new Error('boom'))).toBe(FALLBACK);
    expect(errorMessage(undefined)).toBe(FALLBACK);
  });

  it('a request that never reached a service renders a readable sentence', () => {
    expect(errorMessage(new HttpErrorResponse({ status: 0 }))).toBe(UNREACHABLE);
  });

  it('a screen can word a code for its own context', () => {
    const sentence = errorMessage(failure(401, 'AUTH-401'), { 'AUTH-401': 'Sign-in wording' });

    expect(sentence).toBe('Sign-in wording');
    // Codes the screen does not override still come from the catalogue.
    expect(errorMessage(failure(422, 'VAL-422'), { 'AUTH-401': 'x' })).toBe(
      ERROR_MESSAGES['VAL-422'],
    );
  });

  it('a throttled sign-in says how long to wait', () => {
    const throttled = new HttpErrorResponse({
      status: 401,
      headers: new HttpHeaders({ 'Retry-After': '90' }),
      error: { errorCode: 'AUTH-401', message: 'Unauthorised' },
    });

    expect(errorMessage(throttled)).toContain('Wait 2 minutes');
  });
});
