/**
 * Registration: plaintext is never stored, the user is created with a
 * pending account request and nothing more (no trading account, no accountId,
 * no token), and a missing display name falls back to the email's local
 * part. Runs the real PasswordService at the real cost; only the database is
 * stubbed.
 */
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../config/config.service';
import { AccountsRepository } from '../persistence/accounts.repository';
import { RefreshTokensRepository } from '../persistence/refresh-tokens.repository';
import { UsersRepository } from '../persistence/users.repository';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { Role } from './role.enum';

jest.setTimeout(30_000);

const PLAINTEXT = 'a-password-that-must-never-be-stored';

function setup() {
  const createWithAccountRequest = jest.fn(
    (input: { name: string; email: string; passwordHash: string }) =>
      Promise.resolve({
        id: '7d9f6f2c-9a1b-4e3f-8c2a-5b6d7e8f9a0b',
        email: input.email,
        passwordHash: input.passwordHash,
        status: 'ACTIVE' as const,
        roles: [Role.CUSTOMER],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
  );
  const findAccountIdForUser = jest.fn();
  const service = new AuthService(
    { createWithAccountRequest } as unknown as UsersRepository,
    { findAccountIdForUser } as unknown as AccountsRepository,
    {} as unknown as RefreshTokensRepository,
    new PasswordService(),
    new JwtService({}),
    {} as unknown as AppConfigService,
  );
  return { service, createWithAccountRequest, findAccountIdForUser };
}

describe('registration', () => {
  it('passes only a bcrypt hash (cost >= 12) to the credential store', async () => {
    const { service, createWithAccountRequest } = setup();

    const response = await service.register({
      name: 'Credential Spec',
      username: 'credential.spec@example.com',
      password: PLAINTEXT,
    });

    expect(createWithAccountRequest).toHaveBeenCalledTimes(1);
    const stored = createWithAccountRequest.mock.calls[0][0];

    // What reaches the store: a bcrypt string, never the password.
    expect(stored.passwordHash).toMatch(
      /^\$2[aby]\$(1[2-9]|[23]\d)\$[./A-Za-z0-9]{53}$/,
    );
    expect(JSON.stringify(stored)).not.toContain(PLAINTEXT);

    // And nothing about the credential comes back out in the response.
    expect(JSON.stringify(response)).not.toContain(stored.passwordHash);
    expect(JSON.stringify(response)).not.toContain(PLAINTEXT);
  });

  it('opens no account on registration: no account lookup, no accountId, no token', async () => {
    const { service, findAccountIdForUser } = setup();

    const response = await service.register({
      username: 'new.user@example.com',
      password: PLAINTEXT,
    });

    expect(findAccountIdForUser).not.toHaveBeenCalled();
    expect(Object.keys(response).sort()).toEqual([
      'createdOn',
      'id',
      'roles',
      'username',
    ]);
  });

  it('uses the part of the email before the @ when no name is given', async () => {
    const { service, createWithAccountRequest } = setup();

    await service.register({
      username: 'priya.menon@example.com',
      password: PLAINTEXT,
    });

    expect(createWithAccountRequest.mock.calls[0][0].name).toBe('priya.menon');
  });
});
