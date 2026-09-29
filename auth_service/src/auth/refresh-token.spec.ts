/**
 * Unit test execution paths for "Refresh Token Issuance and Rotation":
 *   - refresh returns a new access token and a new refresh token
 *   - the newly issued refresh token works
 *   - the declared revocation behaviour holds for a token that has already
 *     been exchanged (declared: reuse answers AUTH-401 and revokes the
 *     token's whole family; the user's other families are untouched)
 *
 * The auth_refresh_tokens table is replaced by an in-memory fake that
 * mirrors RefreshTokensRepository, including markUsed's conditional UPDATE.
 */
import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../config/config.service';
import { AccountsRepository } from '../persistence/accounts.repository';
import {
  RefreshTokenRow,
  RefreshTokensRepository,
} from '../persistence/refresh-tokens.repository';
import { AuthUser, UsersRepository } from '../persistence/users.repository';
import { AccessTokenClaims } from './access-token-claims';
import { AuthService } from './auth.service';
import { LoginRequestDto } from './dto/login-request.dto';
import { RefreshRequestDto } from './dto/refresh-request.dto';
import { PasswordService } from './password.service';
import { Role } from './role.enum';

const SERVICE_KEY = 'test-secret-key-that-is-at-least-32-chars-long';

/** The account opened for the user; what the accountId claim must carry. */
const ACCOUNT_ID = 7;

const user: AuthUser = {
  id: '7d9f6f2c-9a1b-4e3f-8c2a-5b6d7e8f9a0b',
  email: 'refresh.spec.user@example.com',
  passwordHash: '$2b$12$unit.test.hash.the.stubs.never.compare',
  status: 'ACTIVE',
  roles: [Role.CUSTOMER],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

const CREDENTIALS: LoginRequestDto = {
  username: user.email,
  password: 'unit-test-password',
};

/** auth_refresh_tokens, in memory. Reads return copies, as a database would. */
class InMemoryRefreshTokens {
  readonly rows = new Map<string, RefreshTokenRow>();

  insert(input: {
    tokenHash: string;
    userId: string;
    familyId: string;
    expiresAt: Date;
  }): Promise<void> {
    this.rows.set(input.tokenHash, {
      ...input,
      issuedAt: new Date(Date.now()),
      usedAt: null,
      revokedAt: null,
    });
    return Promise.resolve();
  }

  findByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
    const row = this.rows.get(tokenHash);
    return Promise.resolve(row ? { ...row } : null);
  }

  /** Mirrors `UPDATE ... WHERE used_at IS NULL AND revoked_at IS NULL`. */
  markUsed(tokenHash: string): Promise<boolean> {
    const row = this.rows.get(tokenHash);
    if (!row || row.usedAt !== null || row.revokedAt !== null) {
      return Promise.resolve(false);
    }
    row.usedAt = new Date(Date.now());
    return Promise.resolve(true);
  }

  revokeFamily(familyId: string): Promise<void> {
    for (const row of this.rows.values()) {
      if (row.familyId === familyId && row.revokedAt === null) {
        row.revokedAt = new Date(Date.now());
      }
    }
    return Promise.resolve();
  }
}

function buildService(store: InMemoryRefreshTokens): AuthService {
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
  const config = { jwtSecret: SERVICE_KEY } as unknown as AppConfigService;
  return new AuthService(
    users,
    accounts,
    store as unknown as RefreshTokensRepository,
    passwords,
    new JwtService({ secret: SERVICE_KEY }),
    config,
  );
}

const refreshWith = (refreshToken: string): RefreshRequestDto => ({
  refreshToken,
});

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

function verifiedClaims(accessToken: string): AccessTokenClaims {
  return new JwtService({}).verify(accessToken, {
    secret: SERVICE_KEY,
    algorithms: ['HS256'],
  });
}

async function expectAuth401(pending: Promise<unknown>): Promise<void> {
  const thrown = await pending.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(thrown).toBeInstanceOf(HttpException);
  const error = thrown as HttpException;
  expect(error.getStatus()).toBe(401);
  expect(error.getResponse()).toEqual({
    errorCode: 'AUTH-401',
    message: 'Unauthorised',
  });
}

/**
 * A controllable clock. jsonwebtoken stamps iat in whole seconds, so a login
 * and a refresh in the same second would mint byte-identical access tokens;
 * stepping the clock makes "a new access token" a real assertion.
 */
let now: number;
beforeEach(() => {
  now = Date.parse('2026-09-23T10:00:00.000Z');
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => jest.restoreAllMocks());

describe('refresh token issuance and rotation', () => {
  it('stores only the SHA-256 hash of a refresh token, never the token', async () => {
    const store = new InMemoryRefreshTokens();
    const { refreshToken } = await buildService(store).login(CREDENTIALS);

    expect([...store.rows.keys()]).toEqual([sha256(refreshToken)]);
    expect(JSON.stringify([...store.rows.values()])).not.toContain(
      refreshToken,
    );
  });

  it('refresh returns a new access token and a new refresh token', async () => {
    const service = buildService(new InMemoryRefreshTokens());
    const first = await service.login(CREDENTIALS);

    now += 1000;
    const second = await service.refresh(refreshWith(first.refreshToken));

    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.accessToken).not.toBe(first.accessToken);
    expect(second.tokenType).toBe('Bearer');
    expect(second.expiresIn).toBe(900);

    const claims = verifiedClaims(second.accessToken);
    expect(claims.sub).toBe(user.id);
    expect(claims.iat).toBe(Math.floor(now / 1000));
  });

  it('the newly issued refresh token works', async () => {
    const store = new InMemoryRefreshTokens();
    const service = buildService(store);
    const first = await service.login(CREDENTIALS);

    now += 1000;
    const second = await service.refresh(refreshWith(first.refreshToken));
    now += 1000;
    const third = await service.refresh(refreshWith(second.refreshToken));

    expect(third.refreshToken).not.toBe(second.refreshToken);
    expect(verifiedClaims(third.accessToken).sub).toBe(user.id);

    // One login, one chain: every rotation joined the same family.
    const families = new Set([...store.rows.values()].map((r) => r.familyId));
    expect(families.size).toBe(1);
  });

  it('refuses an already-exchanged token with AUTH-401 and revokes its family', async () => {
    const store = new InMemoryRefreshTokens();
    const service = buildService(store);
    const first = await service.login(CREDENTIALS);
    const second = await service.refresh(refreshWith(first.refreshToken));

    // Second presentation of the exchanged token: refused.
    await expectAuth401(service.refresh(refreshWith(first.refreshToken)));

    // Reuse is theft: the live token the exchange issued dies too, so
    // neither party keeps a session it can extend.
    await expectAuth401(service.refresh(refreshWith(second.refreshToken)));
    for (const row of store.rows.values()) {
      expect(row.revokedAt).not.toBeNull();
    }
  });

  it("leaves the user's other login chains alone", async () => {
    const service = buildService(new InMemoryRefreshTokens());
    const laptop = await service.login(CREDENTIALS);
    const phone = await service.login(CREDENTIALS);

    await service.refresh(refreshWith(laptop.refreshToken));
    await expectAuth401(service.refresh(refreshWith(laptop.refreshToken)));

    // The phone's chain is a different family and still works.
    await expect(
      service.refresh(refreshWith(phone.refreshToken)),
    ).resolves.toMatchObject({ tokenType: 'Bearer' });
  });

  it('lets exactly one of two concurrent exchanges of the same token through', async () => {
    const service = buildService(new InMemoryRefreshTokens());
    const { refreshToken } = await service.login(CREDENTIALS);

    const outcomes = await Promise.allSettled([
      service.refresh(refreshWith(refreshToken)),
      service.refresh(refreshWith(refreshToken)),
    ]);

    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
  });

  it('refuses an expired refresh token', async () => {
    const service = buildService(new InMemoryRefreshTokens());
    const { refreshToken } = await service.login(CREDENTIALS);

    now += 7 * 24 * 60 * 60 * 1000 + 1000; // just past the 7-day lifetime
    await expectAuth401(service.refresh(refreshWith(refreshToken)));
  });

  it('refuses an unknown refresh token', async () => {
    const service = buildService(new InMemoryRefreshTokens());
    await expectAuth401(service.refresh(refreshWith('never-issued')));
  });
});
