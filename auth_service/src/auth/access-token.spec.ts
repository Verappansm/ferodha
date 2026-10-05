/**
 * Unit test execution paths for "Access Token Issuance and the Exact Claim
 * Set": a token issued with the contract claims and expiry, a signature that
 * verifies with the service key, and no claim outside the contract set.
 *
 * The payload is base64, not encryption - anything beyond the contract's
 * claims is published to every holder of the token, which is what the third
 * path pins down.
 */
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../config/config.service';
import { AccountsRepository } from '../persistence/accounts.repository';
import { RefreshTokensRepository } from '../persistence/refresh-tokens.repository';
import { AuthUser, UsersRepository } from '../persistence/users.repository';
import { AccessTokenClaims } from './access-token-claims';
import { AuthService, JWT_ISSUER } from './auth.service';
import { LoginRequestDto } from './dto/login-request.dto';
import { PasswordService } from './password.service';
import { Role } from './role.enum';

/** The service key for this unit: what the service signs with. */
const SERVICE_KEY = 'test-secret-key-that-is-at-least-32-chars-long';

/** The account opened for the user; what the accountId claim must carry. */
const ACCOUNT_ID = 7;

const user: AuthUser = {
  id: '7d9f6f2c-9a1b-4e3f-8c2a-5b6d7e8f9a0b',
  email: 'token.spec.user@example.com',
  passwordHash: '$2b$12$unit.test.hash.the.stubs.never.compare',
  status: 'ACTIVE',
  roles: [Role.CUSTOMER],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const CREDENTIALS: LoginRequestDto = {
  username: user.email,
  password: 'unit-test-password',
};

/** The service under test, wired to stubs - no database, no bcrypt cost. */
function buildService(): AuthService {
  const users = {
    findByEmail: () => Promise.resolve(user),
    findById: () => Promise.resolve(user),
  } as unknown as UsersRepository;
  const accounts = {
    findAccountIdForUser: () => Promise.resolve(ACCOUNT_ID),
  } as unknown as AccountsRepository;
  const passwords = {
    hash: () => Promise.resolve(''),
    verify: () => Promise.resolve(true),
    verifyAgainstDecoy: () => Promise.resolve(false),
  } as unknown as PasswordService;
  const refreshTokens = {
    insert: () => Promise.resolve(),
  } as unknown as RefreshTokensRepository;
  const config = { jwtSecret: SERVICE_KEY } as unknown as AppConfigService;
  const jwt = new JwtService({ secret: SERVICE_KEY });
  return new AuthService(
    users,
    accounts,
    refreshTokens,
    passwords,
    jwt,
    config,
  );
}

/**
 * Verifies with the service key first (so a payload that failed the
 * signature is never asserted on), then hands back the typed claims.
 */
function issuedClaims(token: string): AccessTokenClaims {
  const verified: unknown = new JwtService({}).verify(token, {
    secret: SERVICE_KEY,
    algorithms: ['HS256'],
  });
  return verified as AccessTokenClaims;
}

describe('access token issuance', () => {
  it('is issued with the contract claims and expiry', async () => {
    const { accessToken } = await buildService().login(CREDENTIALS);
    const claims = issuedClaims(accessToken);

    expect(claims.sub).toBe(user.id);
    expect(typeof claims.accountId).toBe('number');
    expect(Number.isInteger(claims.accountId)).toBe(true);
    expect(claims.accountId).toBe(ACCOUNT_ID);
    expect(claims.roles).toEqual([Role.CUSTOMER]);
    expect(claims.iss).toBe(JWT_ISSUER);
    expect(typeof claims.iat).toBe('number');
    expect(typeof claims.exp).toBe('number');
    expect(claims.exp - claims.iat).toBe(900);
  });

  it('signature verifies with the service key', async () => {
    const { accessToken } = await buildService().login(CREDENTIALS);

    expect(() => {
      new JwtService({}).verify(accessToken, {
        secret: SERVICE_KEY,
        algorithms: ['HS256'],
      });
    }).not.toThrow();
  });

  it('has no claim outside the contract set', async () => {
    const { accessToken } = await buildService().login(CREDENTIALS);

    expect(Object.keys(issuedClaims(accessToken)).sort()).toEqual([
      'accountId',
      'exp',
      'iat',
      'iss',
      'roles',
      'sub',
    ]);
  });
});
