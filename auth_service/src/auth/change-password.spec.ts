/**
 * A forced reset (LEAP-016) and the change-password route (LEAP-010): the
 * right password on a user flagged by an admin gets AUTH-428 and no tokens;
 * changing the password clears the flag and ends every session.
 */
import { HttpException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../config/config.service';
import { AccountsRepository } from '../persistence/accounts.repository';
import { RefreshTokensRepository } from '../persistence/refresh-tokens.repository';
import { AuthUser, UsersRepository } from '../persistence/users.repository';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { Role } from './role.enum';

const SERVICE_KEY = 'test-secret-key-that-is-at-least-32-chars-long';
const EMAIL = 'john.carter@example.com';
const CURRENT = 'current-password-digest';
const NEXT = 'brand-new-password-digest';

function bodyOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error('expected a refusal');
    },
    (error: unknown) => (error as HttpException).getResponse(),
  );
}

describe('AuthService forced reset and change password', () => {
  let user: AuthUser;
  let updatePassword: jest.Mock;
  let revokeAllForUser: jest.Mock;
  let service: AuthService;

  beforeEach(() => {
    user = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'John Carter',
      email: EMAIL,
      passwordHash: `hash:${CURRENT}`,
      status: 'ACTIVE',
      roles: [Role.CUSTOMER],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      phone: undefined,
      mustChangePassword: true,
    };
    updatePassword = jest.fn((_id: string, hash: string) => {
      user = { ...user, passwordHash: hash, mustChangePassword: false };
      return Promise.resolve();
    });
    revokeAllForUser = jest.fn().mockResolvedValue(undefined);
    const passwords = {
      hash: (plain: string) => Promise.resolve(`hash:${plain}`),
      verify: (plain: string, hash: string) =>
        Promise.resolve(hash === `hash:${plain}`),
      verifyAgainstDecoy: () => Promise.resolve(false),
    } as unknown as PasswordService;
    service = new AuthService(
      {
        findByEmail: (email: string) =>
          Promise.resolve(email === EMAIL ? user : null),
        updatePassword,
      } as unknown as UsersRepository,
      {
        findAccountIdForUser: () => Promise.resolve(1),
      } as unknown as AccountsRepository,
      {
        insert: () => Promise.resolve(),
        revokeAllForUser,
      } as unknown as RefreshTokensRepository,
      passwords,
      new JwtService({ secret: SERVICE_KEY }),
      { jwtSecret: SERVICE_KEY } as unknown as AppConfigService,
    );
  });

  it('holds the login of a user whose reset was forced, with AUTH-428', async () => {
    await expect(
      bodyOf(service.login({ username: EMAIL, password: CURRENT })),
    ).resolves.toEqual({
      errorCode: 'AUTH-428',
      message: 'Password change required',
    });
  });

  it('still answers a wrong password with the shared AUTH-401', async () => {
    await expect(
      bodyOf(service.login({ username: EMAIL, password: 'wrong' })),
    ).resolves.toEqual({ errorCode: 'AUTH-401', message: 'Unauthorised' });
  });

  it('changes the password, clears the reset, ends every session, then signs in', async () => {
    await service.changePassword({
      username: EMAIL,
      currentPassword: CURRENT,
      newPassword: NEXT,
    });
    expect(updatePassword).toHaveBeenCalledWith(user.id, `hash:${NEXT}`);
    expect(revokeAllForUser).toHaveBeenCalledWith(user.id);

    const tokens = await service.login({ username: EMAIL, password: NEXT });
    expect(tokens.accessToken).toBeTruthy();
  });

  it('refuses a wrong current password with AUTH-401 and changes nothing', async () => {
    await expect(
      bodyOf(
        service.changePassword({
          username: EMAIL,
          currentPassword: 'wrong',
          newPassword: NEXT,
        }),
      ),
    ).resolves.toEqual({ errorCode: 'AUTH-401', message: 'Unauthorised' });
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it('refuses a suspended user', async () => {
    user = { ...user, status: 'SUSPENDED' };
    await expect(
      bodyOf(
        service.changePassword({
          username: EMAIL,
          currentPassword: CURRENT,
          newPassword: NEXT,
        }),
      ),
    ).resolves.toEqual({ errorCode: 'AUTH-401', message: 'Unauthorised' });
  });

  it('refuses a new password equal to the current one', async () => {
    await expect(
      bodyOf(
        service.changePassword({
          username: EMAIL,
          currentPassword: CURRENT,
          newPassword: CURRENT,
        }),
      ),
    ).resolves.toEqual({ errorCode: 'VAL-422', message: 'Invalid input' });
  });
});
