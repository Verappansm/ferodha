/**
 * "One answer for every failed login": an unknown user, a wrong password, an
 * inactive user and a user with no trading account yet all get the same
 * status and body, and every one of them pays for a bcrypt comparison before
 * the answer is sent. These run real bcrypt at cost 12, so the timeout is
 * raised.
 */
import { HttpException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../config/config.service';
import { AccountsRepository } from '../persistence/accounts.repository';
import { RefreshTokensRepository } from '../persistence/refresh-tokens.repository';
import {
  AuthUser,
  UsersRepository,
  UserStatus,
} from '../persistence/users.repository';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { Role } from './role.enum';

jest.setTimeout(120_000);

const PASSWORD = 'correct horse battery staple';
const WRONG_PASSWORD = 'wrong password';
const UNKNOWN_EMAIL = 'unknown@example.com';
const SERVICE_KEY = 'test-secret-key-that-is-at-least-32-chars-long';

const UNAUTHORISED_BODY = { errorCode: 'AUTH-401', message: 'Unauthorised' };

/** The response body a rejected login carried. Fails if the login succeeded. */
function failureBody(login: Promise<unknown>): Promise<unknown> {
  return login.then(
    () => {
      throw new Error('expected the login to fail');
    },
    (error: unknown) => (error as HttpException).getResponse(),
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

describe('AuthService login - one answer for every failure', () => {
  let passwords: PasswordService;
  let hash: string;
  const usersByEmail = new Map<string, AuthUser>();
  const accountByUserId = new Map<string, number>();

  function addUser(
    email: string,
    status: UserStatus,
    accountId: number | null,
    passwordHash = hash,
  ): void {
    const id = `00000000-0000-4000-8000-${String(usersByEmail.size).padStart(12, '0')}`;
    usersByEmail.set(email, {
      id,
      email,
      passwordHash,
      status,
      roles: [Role.CUSTOMER],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    if (accountId !== null) {
      accountByUserId.set(id, accountId);
    }
  }

  function buildService(): AuthService {
    return new AuthService(
      {
        findByEmail: (email: string) =>
          Promise.resolve(usersByEmail.get(email) ?? null),
      } as unknown as UsersRepository,
      {
        findAccountIdForUser: (userId: string) =>
          Promise.resolve(accountByUserId.get(userId) ?? null),
      } as unknown as AccountsRepository,
      { insert: () => Promise.resolve() } as unknown as RefreshTokensRepository,
      passwords,
      new JwtService({ secret: SERVICE_KEY }),
      { jwtSecret: SERVICE_KEY } as unknown as AppConfigService,
    );
  }

  beforeAll(async () => {
    passwords = new PasswordService();
    await passwords.onModuleInit();
    hash = await passwords.hash(PASSWORD);
    addUser('active@example.com', 'ACTIVE', 1);
    addUser('suspended@example.com', 'SUSPENDED', 2);
    addUser('closed@example.com', 'CLOSED', 3);
    addUser('pending@example.com', 'PENDING', 4);
    addUser('no.account@example.com', 'ACTIVE', null);
    addUser('seeded@example.com', 'ACTIVE', 5, '$2b$12$placeholder_hash');
  });

  afterEach(() => jest.restoreAllMocks());

  it('refuses an administrator: operators sign in to the console, never here', async () => {
    addUser('operator@example.com', 'ACTIVE', 9);
    usersByEmail.get('operator@example.com')!.roles = [Role.ADMIN];

    const body = await failureBody(
      buildService().login({
        username: 'operator@example.com',
        password: PASSWORD,
      }),
    );

    expect(body).toEqual({ errorCode: 'AUTH-401', message: 'Unauthorised' });
  });

  it('an unknown user and a wrong password return the same status and body', async () => {
    const service = buildService();
    const unknown = await failureBody(
      service.login({ username: UNKNOWN_EMAIL, password: WRONG_PASSWORD }),
    );
    const wrong = await failureBody(
      service.login({
        username: 'active@example.com',
        password: WRONG_PASSWORD,
      }),
    );

    expect(unknown).toEqual(UNAUTHORISED_BODY);
    expect(wrong).toEqual(unknown);
  });

  it('neither path returns before doing a bcrypt comparison', async () => {
    const service = buildService();
    const verify = jest.spyOn(passwords, 'verify');
    const decoy = jest.spyOn(passwords, 'verifyAgainstDecoy');

    await failureBody(
      service.login({ username: UNKNOWN_EMAIL, password: WRONG_PASSWORD }),
    );
    expect(decoy).toHaveBeenCalledTimes(1);
    expect(verify).not.toHaveBeenCalled();

    decoy.mockClear();
    await failureBody(
      service.login({
        username: 'active@example.com',
        password: WRONG_PASSWORD,
      }),
    );
    expect(verify).toHaveBeenCalledTimes(1);
    expect(decoy).not.toHaveBeenCalled();
  });

  it('the two paths take comparable time (judged by shape, not by size)', async () => {
    const service = buildService();
    const time = async (username: string) => {
      const start = process.hrtime.bigint();
      await failureBody(service.login({ username, password: WRONG_PASSWORD }));
      return Number(process.hrtime.bigint() - start) / 1e6;
    };

    const unknown: number[] = [];
    const wrong: number[] = [];
    for (let run = 0; run < 5; run++) {
      unknown.push(await time(UNKNOWN_EMAIL));
      wrong.push(await time('active@example.com'));
    }

    // One path taking twice as long as the other is an early return, however
    // small both numbers are. No absolute threshold: a busy machine moves both.
    const ratio =
      Math.max(median(unknown), median(wrong)) /
      Math.min(median(unknown), median(wrong));
    expect(ratio).toBeLessThan(2);
  });

  it('a stored value that is not a bcrypt hash still costs a full comparison', async () => {
    const service = buildService();
    const decoy = jest.spyOn(passwords, 'verifyAgainstDecoy');

    await expect(
      failureBody(
        service.login({ username: 'seeded@example.com', password: PASSWORD }),
      ),
    ).resolves.toEqual(UNAUTHORISED_BODY);
    expect(decoy).toHaveBeenCalledTimes(1);
  });

  it.each([
    'suspended@example.com',
    'closed@example.com',
    'pending@example.com',
  ])(
    'refuses %s with the right password, after the same bcrypt work',
    async (username) => {
      const service = buildService();
      const verify = jest.spyOn(passwords, 'verify');

      await expect(
        failureBody(service.login({ username, password: PASSWORD })),
      ).resolves.toEqual(UNAUTHORISED_BODY);
      expect(verify).toHaveBeenCalledTimes(1);
    },
  );

  it('refuses a user who has no trading account yet', async () => {
    const service = buildService();
    await expect(
      failureBody(
        service.login({
          username: 'no.account@example.com',
          password: PASSWORD,
        }),
      ),
    ).resolves.toEqual(UNAUTHORISED_BODY);
  });

  it('lets an ACTIVE user with an account in', async () => {
    const service = buildService();
    const response = await service.login({
      username: 'active@example.com',
      password: PASSWORD,
    });
    expect(response.tokenType).toBe('Bearer');
  });
});
