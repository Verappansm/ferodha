/**
 * The operations console's half of the auth service:
 *   - admin sign-in issues a 15-minute admin-console token, and refuses
 *     wrong passwords, non-admins and inactive admins with one AUTH-401
 *   - the admin guard accepts only that token: no token or a forged one is
 *     AUTH-401, a genuine customer token is AUTH-403
 *   - user actions map to ADM-404 / ADM-409, and an operator never acts on
 *     their own account
 * The database is stubbed; the SQL runs only against a real Postgres.
 */
import { ExecutionContext, HttpException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JWT_ISSUER } from '../auth/auth.service';
import { PasswordService } from '../auth/password.service';
import { AppConfigService } from '../config/config.service';
import { ADMIN_AUDIENCE, AdminJwtGuard, AdminRequest } from './admin-jwt.guard';
import {
  AdminCredentials,
  AdminUser,
  AdminUsersRepository,
} from './admin-users.repository';
import { AdminService } from './admin.service';

jest.setTimeout(30_000);

const KEY = 'test-secret-key-that-is-at-least-32-chars-long';
const config = { jwtSecret: KEY } as unknown as AppConfigService;
const ADMIN_ID = '55555555-5555-4555-8555-555555555555';
const TARGET_ID = '77777777-7777-4777-8777-777777777771';
const PASSWORD = 'seed-password-change-me';

async function status(
  promise: Promise<unknown>,
): Promise<{ status: number; code: string }> {
  try {
    await promise;
  } catch (error) {
    const e = error as HttpException;
    return {
      status: e.getStatus(),
      code: (e.getResponse() as { errorCode: string }).errorCode,
    };
  }
  throw new Error('expected a refusal');
}

describe('Admin sign-in', () => {
  let passwords: PasswordService;
  let admin: AdminCredentials;
  const jwt = new JwtService({ secret: KEY });

  beforeAll(async () => {
    passwords = new PasswordService();
    await passwords.onModuleInit();
    admin = {
      id: ADMIN_ID,
      name: 'Michael Brown',
      email: 'michael.brown@example.com',
      passwordHash: await passwords.hash(PASSWORD),
      status: 'ACTIVE',
    };
  });

  function service(found: AdminCredentials | null) {
    const repo = {
      findAdminByEmail: jest.fn().mockResolvedValue(found),
      recordLogin: jest.fn().mockResolvedValue(undefined),
    } as unknown as AdminUsersRepository;
    return new AdminService(repo, passwords, jwt, config);
  }

  it('issues a 15-minute admin-console token with the ADMIN role and no accountId', async () => {
    const tokens = await service(admin).login(admin.email, PASSWORD);
    const claims = jwt.verify<Record<string, unknown>>(tokens.accessToken, {
      secret: KEY,
    });

    expect(tokens.expiresIn).toBe(900);
    expect(claims.aud).toBe(ADMIN_AUDIENCE);
    expect(claims.roles).toEqual(['ADMIN']);
    expect(claims.iss).toBe(JWT_ISSUER);
    expect(claims).not.toHaveProperty('accountId');
    expect(tokens).not.toHaveProperty('refreshToken');
  });

  it('refuses a wrong password, a non-admin and a suspended admin with the same AUTH-401', async () => {
    expect(
      await status(service(admin).login(admin.email, 'wrong-password')),
    ).toEqual({
      status: 401,
      code: 'AUTH-401',
    });
    expect(
      await status(service(null).login('john.carter@example.com', PASSWORD)),
    ).toEqual({
      status: 401,
      code: 'AUTH-401',
    });
    expect(
      await status(
        service({ ...admin, status: 'SUSPENDED' }).login(admin.email, PASSWORD),
      ),
    ).toEqual({ status: 401, code: 'AUTH-401' });
  });
});

describe('AdminJwtGuard', () => {
  const jwt = new JwtService({ secret: KEY });
  const guard = new AdminJwtGuard(jwt, config);

  function context(authorization?: string): {
    ctx: ExecutionContext;
    request: AdminRequest;
  } {
    const request = { headers: { authorization } } as unknown as AdminRequest;
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { ctx, request };
  }

  function token(
    payload: Record<string, unknown>,
    options: Record<string, unknown> = {},
    key = KEY,
  ) {
    return jwt.sign(payload, {
      secret: key,
      algorithm: 'HS256',
      expiresIn: 900,
      ...options,
    });
  }

  const adminToken = () =>
    token(
      { sub: ADMIN_ID, roles: ['ADMIN'], iss: JWT_ISSUER },
      { audience: ADMIN_AUDIENCE },
    );

  function code(fn: () => unknown): number {
    try {
      fn();
    } catch (error) {
      return (error as HttpException).getStatus();
    }
    return 200;
  }

  it('accepts an admin console token and exposes the operator', () => {
    const { ctx, request } = context(`Bearer ${adminToken()}`);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.admin.sub).toBe(ADMIN_ID);
  });

  it('refuses a missing header or a forged token with AUTH-401', () => {
    expect(code(() => guard.canActivate(context().ctx))).toBe(401);
    const forged = token(
      { sub: ADMIN_ID, roles: ['ADMIN'], iss: JWT_ISSUER },
      { audience: ADMIN_AUDIENCE },
      'a-different-key-that-is-also-at-least-32-chars',
    );
    expect(code(() => guard.canActivate(context(`Bearer ${forged}`).ctx))).toBe(
      401,
    );
  });

  it('refuses a genuine customer token with AUTH-403', () => {
    const customer = token({
      sub: TARGET_ID,
      accountId: 1,
      roles: ['CUSTOMER'],
      iss: JWT_ISSUER,
    });
    expect(
      code(() => guard.canActivate(context(`Bearer ${customer}`).ctx)),
    ).toBe(403);
  });
});

describe('Admin user actions', () => {
  const updated: AdminUser = {
    id: TARGET_ID,
    name: 'Priya Menon',
    email: 'priya@example.com',
    role: 'client',
    status: 'SUSPENDED',
    mustChangePassword: false,
    accountCount: 0,
    createdOn: '2026-01-01T00:00:00.000Z',
    lastLogin: null,
  };

  function service(result: AdminUser | 'not-found' | 'conflict') {
    const changeUser = jest.fn().mockResolvedValue(result);
    const repo = { changeUser } as unknown as AdminUsersRepository;
    return {
      changeUser,
      admin: new AdminService(
        repo,
        {} as PasswordService,
        new JwtService({}),
        config,
      ),
    };
  }

  it('suspending revokes sessions and records the decision', async () => {
    const { admin, changeUser } = service(updated);

    await admin.suspend(ADMIN_ID, TARGET_ID, 'Fraud review');

    expect(changeUser).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: TARGET_ID,
        adminId: ADMIN_ID,
        from: 'ACTIVE',
        to: 'SUSPENDED',
        revokeSessions: true,
        action: 'USER_SUSPENDED',
        reason: 'Fraud review',
      }),
    );
  });

  it('a forced reset keeps the user ACTIVE but requires a new password', async () => {
    const { admin, changeUser } = service(updated);

    await admin.forcePasswordReset(ADMIN_ID, TARGET_ID, 'Credentials exposed');

    expect(changeUser).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'ACTIVE',
        to: 'ACTIVE',
        mustChangePassword: true,
      }),
    );
  });

  it('maps an unknown user to ADM-404 and a wrong state to ADM-409', async () => {
    expect(
      await status(
        service('not-found').admin.suspend(ADMIN_ID, TARGET_ID, 'x x'),
      ),
    ).toEqual({
      status: 404,
      code: 'ADM-404',
    });
    expect(
      await status(
        service('conflict').admin.reactivate(ADMIN_ID, TARGET_ID, 'x x'),
      ),
    ).toEqual({ status: 409, code: 'ADM-409' });
  });

  it('an operator cannot act on their own account', async () => {
    const { admin, changeUser } = service(updated);

    expect(await status(admin.suspend(ADMIN_ID, ADMIN_ID, 'Testing'))).toEqual({
      status: 409,
      code: 'ADM-409',
    });
    expect(changeUser).not.toHaveBeenCalled();
  });
});
