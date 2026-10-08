/**
 * LEAP-012 and LEAP-010: the account-request status, checked with the email and password
 * like a login, and signing out everywhere. Real bcrypt at a low cost.
 */
import { HttpException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../config/config.service';
import {
  AccountRequestRow,
  AccountsRepository,
} from '../persistence/accounts.repository';
import { RefreshTokensRepository } from '../persistence/refresh-tokens.repository';
import { AuthUser, UsersRepository } from '../persistence/users.repository';
import { AccessTokenClaims } from './access-token-claims';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { Role } from './role.enum';

jest.setTimeout(60_000);

const PASSWORD = 'correct horse battery staple';
const USER_ID = '00000000-0000-4000-8000-000000000042';

describe('AuthService account status and sign out everywhere', () => {
  let passwords: PasswordService;
  let user: AuthUser;
  let request: AccountRequestRow | null;
  let verified: boolean;
  const revokeAllForUser = jest.fn(() => Promise.resolve());

  function service(): AuthService {
    return new AuthService(
      {
        findByEmail: (email: string) =>
          Promise.resolve(email === user.email ? user : null),
        isEmailVerified: () => Promise.resolve(verified),
      } as unknown as UsersRepository,
      {
        findLatestRequest: () => Promise.resolve(request),
      } as unknown as AccountsRepository,
      { revokeAllForUser } as unknown as RefreshTokensRepository,
      passwords,
      new JwtService({ secret: 'x'.repeat(32) }),
      { jwtSecret: 'x'.repeat(32) } as unknown as AppConfigService,
    );
  }

  const statusOf = (p: Promise<unknown>): Promise<number> =>
    p.then(
      () => 0,
      (e: unknown) => (e as HttpException).getStatus(),
    );

  beforeAll(async () => {
    passwords = new PasswordService();
    await passwords.onModuleInit();
    user = {
      id: USER_ID,
      name: 'Priya',
      phone: undefined,
      email: 'priya@example.com',
      passwordHash: await passwords.hash(PASSWORD),
      status: 'ACTIVE',
      roles: [Role.CUSTOMER],
      createdAt: new Date('2026-10-01T00:00:00Z'),
    };
  });

  beforeEach(() => {
    request = null;
    verified = false;
    revokeAllForUser.mockClear();
  });

  it('each request state renders its own answer, with the reason only when rejected', async () => {
    request = {
      status: 'PENDING',
      reason: null,
      requestedAt: new Date('2026-10-01T09:00:00Z'),
      decidedAt: null,
    };
    expect(
      await service().accountStatus({
        username: user.email,
        password: PASSWORD,
      }),
    ).toEqual({
      status: 'PENDING',
      reason: null,
      emailVerified: false,
      requestedAt: '2026-10-01T09:00:00.000Z',
      decidedAt: null,
    });

    verified = true;
    request = {
      status: 'REJECTED',
      reason: 'The bank holds no account under this email.',
      requestedAt: new Date('2026-10-01T09:00:00Z'),
      decidedAt: new Date('2026-10-02T10:00:00Z'),
    };
    const rejected = await service().accountStatus({
      username: user.email,
      password: PASSWORD,
    });
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.reason).toBe('The bank holds no account under this email.');
    expect(rejected.emailVerified).toBe(true);
  });

  it('a user with no request at all reads NONE', async () => {
    const status = await service().accountStatus({
      username: user.email,
      password: PASSWORD,
    });
    expect(status.status).toBe('NONE');
  });

  it('a wrong password and an unknown email are the same AUTH-401, and say nothing', async () => {
    request = {
      status: 'APPROVED',
      reason: null,
      requestedAt: new Date(),
      decidedAt: new Date(),
    };
    expect(
      await statusOf(
        service().accountStatus({
          username: user.email,
          password: 'wrong one here',
        }),
      ),
    ).toBe(401);
    expect(
      await statusOf(
        service().accountStatus({
          username: 'nobody@example.com',
          password: PASSWORD,
        }),
      ),
    ).toBe(401);
  });

  it('signing out everywhere revokes every refresh token the user holds', async () => {
    await service().logoutEverywhere({ sub: USER_ID } as AccessTokenClaims);
    expect(revokeAllForUser).toHaveBeenCalledWith(USER_ID);
  });
});
