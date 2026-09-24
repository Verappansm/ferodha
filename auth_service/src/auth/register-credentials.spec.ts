/**
 * "Plaintext is never stored": registration hands the repository a bcrypt
 * hash and nothing that contains the password itself. Runs the real
 * PasswordService at the real cost; only the database is stubbed.
 */
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../config/config.service';
import { AccountsRepository } from '../persistence/accounts.repository';
import { RefreshTokensRepository } from '../persistence/refresh-tokens.repository';
import { UsersRepository } from '../persistence/users.repository';
import { AuthService } from './auth.service';
import { RegisterRequestDto } from './dto/register-request.dto';
import { PasswordService } from './password.service';
import { Role } from './role.enum';

jest.setTimeout(30_000);

const PLAINTEXT = 'a-password-that-must-never-be-stored';

describe('registration credential storage', () => {
  it('passes only a bcrypt hash (cost >= 12) to the credential store', async () => {
    const create = jest.fn((input: { email: string; passwordHash: string; accountId: number }) =>
      Promise.resolve({
        id: '7d9f6f2c-9a1b-4e3f-8c2a-5b6d7e8f9a0b',
        email: input.email,
        passwordHash: input.passwordHash,
        accountId: input.accountId,
        roles: [Role.CUSTOMER],
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );
    const users = { create } as unknown as UsersRepository;
    const accounts = {
      exists: () => Promise.resolve(true),
    } as unknown as AccountsRepository;
    const service = new AuthService(
      users,
      accounts,
      {} as unknown as RefreshTokensRepository,
      new PasswordService(),
      new JwtService({}),
      {} as unknown as AppConfigService,
    );

    const response = await service.register({
      name: 'Credential Spec',
      username: 'credential.spec@example.com',
      password: PLAINTEXT,
      accountId: 1,
    } as RegisterRequestDto);

    expect(create).toHaveBeenCalledTimes(1);
    const stored = create.mock.calls[0][0];

    // What reaches the store: a bcrypt string, never the password.
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$(1[2-9]|[23]\d)\$[./A-Za-z0-9]{53}$/);
    expect(JSON.stringify(stored)).not.toContain(PLAINTEXT);

    // And nothing about the credential comes back out in the response.
    expect(JSON.stringify(response)).not.toContain(stored.passwordHash);
    expect(JSON.stringify(response)).not.toContain(PLAINTEXT);
  });
});
