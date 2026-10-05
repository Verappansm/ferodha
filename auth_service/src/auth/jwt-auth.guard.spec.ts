/**
 * Unit test execution paths for "Guard and Token Verification on the
 * Protected Route":
 *   - a valid token is accepted
 *   - an expired token is refused
 *   - a token with a wrong signature is refused before any claim is read
 *   - a malformed header is refused
 *
 * Every bad token here is GENUINE - really signed, intact payload - so each
 * test fails for the one reason it names. Corrupting a payload would be
 * refused by the signature check first and prove nothing about the clock.
 */
import { ExecutionContext, HttpException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { AppConfigService } from '../config/config.service';
import { AccessTokenClaims } from './access-token-claims';
import { JWT_ISSUER } from './auth.service';
import { AuthenticatedRequest, JwtAuthGuard } from './jwt-auth.guard';
import { Role } from './role.enum';

/** What the service signs and verifies with. */
const SERVICE_KEY = 'test-secret-key-that-is-at-least-32-chars-long';
/** A perfectly good key - just not this service's. */
const OTHER_KEY = 'a-different-key-that-is-also-at-least-32-chars';

const CONTRACT_CLAIMS: Omit<AccessTokenClaims, 'iat' | 'exp'> = {
  sub: '7d9f6f2c-9a1b-4e3f-8c2a-5b6d7e8f9a0b',
  accountId: 7,
  roles: [Role.CUSTOMER],
  iss: JWT_ISSUER,
};

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/** A real HS256 token over the contract claims, with explicit iat/exp. */
function sign(
  key: string,
  times: { iat: number; exp: number } = {
    iat: nowSeconds(),
    exp: nowSeconds() + 900,
  },
  claims: object = CONTRACT_CLAIMS,
): string {
  return new JwtService({}).sign(
    { ...claims, ...times },
    { secret: key, algorithm: 'HS256' },
  );
}

/** The guard under test, with a spy on the one call that checks the signature. */
function setup() {
  const jwt = new JwtService({});
  const config = { jwtSecret: SERVICE_KEY } as unknown as AppConfigService;
  const verifySpy = jest.spyOn(jwt, 'verify');
  return { guard: new JwtAuthGuard(jwt, config), verifySpy };
}

/** A bare HTTP ExecutionContext carrying just the Authorization header. */
function contextWith(authorization?: string) {
  const request = {
    headers: authorization === undefined ? {} : { authorization },
  } as unknown as Request;
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { request: request as Partial<AuthenticatedRequest>, context };
}

/** Refused the contract way: HTTP 401 carrying the AUTH-401 envelope. */
function expectAuth401(run: () => unknown): void {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(HttpException);
  const error = thrown as HttpException;
  expect(error.getStatus()).toBe(401);
  expect(JSON.stringify(error.getResponse())).toContain('AUTH-401');
}

afterEach(() => jest.restoreAllMocks());

describe('JwtAuthGuard', () => {
  it('accepts a valid token and exposes its verified claims', () => {
    const { guard } = setup();
    const { request, context } = contextWith(`Bearer ${sign(SERVICE_KEY)}`);

    expect(guard.canActivate(context)).toBe(true);
    expect(request.user).toMatchObject(CONTRACT_CLAIMS);
  });

  it('refuses an expired token', () => {
    const { guard, verifySpy } = setup();
    const issuedAnHourAgo = nowSeconds() - 3600;
    const token = sign(SERVICE_KEY, {
      iat: issuedAnHourAgo,
      exp: issuedAnHourAgo + 900,
    });

    // Genuine: right key, intact payload. Only the clock is wrong with it.
    expect(() => {
      new JwtService({}).verify(token, {
        secret: SERVICE_KEY,
        algorithms: ['HS256'],
        ignoreExpiration: true,
      });
    }).not.toThrow();

    const { request, context } = contextWith(`Bearer ${token}`);
    expectAuth401(() => guard.canActivate(context));

    // Refused by the expiry check specifically, not by anything else.
    expect(verifySpy.mock.results[0].type).toBe('throw');
    expect((verifySpy.mock.results[0].value as Error).name).toBe(
      'TokenExpiredError',
    );
    expect(request.user).toBeUndefined();
  });

  it('refuses a wrongly signed token before any claim is read', () => {
    const { guard, verifySpy } = setup();
    // Genuine, unexpired and contract-shaped - signed with someone else's key.
    const token = sign(OTHER_KEY);
    const { request, context } = contextWith(`Bearer ${token}`);

    expectAuth401(() => guard.canActivate(context));

    // verify() threw on the signature, so no payload ever came back to the
    // guard: the claim-shape check never ran and nothing was attached.
    expect(verifySpy).toHaveBeenCalledTimes(1);
    expect(verifySpy.mock.results[0].type).toBe('throw');
    expect((verifySpy.mock.results[0].value as Error).message).toBe(
      'invalid signature',
    );
    expect(request.user).toBeUndefined();
  });

  it.each([
    ['no Authorization header', undefined],
    ['an empty header', ''],
    ['a non-Bearer scheme', 'Basic dXNlcjpwYXNzd29yZA=='],
    ['Bearer with no token', 'Bearer'],
    ['Bearer followed only by spaces', 'Bearer     '],
    ['a value that is not a JWT', 'Bearer not-a-jwt'],
    ['three segments of garbage', 'Bearer aaa.bbb.ccc'],
  ])('refuses a malformed header: %s', (_label, header) => {
    const { guard } = setup();
    const { request, context } = contextWith(header);

    expectAuth401(() => guard.canActivate(context));
    expect(request.user).toBeUndefined();
  });

  it('refuses a valid token sent without the Bearer scheme', () => {
    const { guard } = setup();
    const { context } = contextWith(sign(SERVICE_KEY));

    expectAuth401(() => guard.canActivate(context));
  });

  it('refuses a correctly signed token whose claims break the contract', () => {
    const { guard } = setup();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { accountId, ...withoutAccount } = CONTRACT_CLAIMS;
    const token = sign(
      SERVICE_KEY,
      { iat: nowSeconds(), exp: nowSeconds() + 900 },
      withoutAccount,
    );
    const { context } = contextWith(`Bearer ${token}`);

    expectAuth401(() => guard.canActivate(context));
  });
});
