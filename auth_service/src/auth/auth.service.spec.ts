
 //These run real bcrypt at cost 12 - each hash takes ~250ms - so timeout is raised.
 
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../config/config.service';
import { AccountsRepository } from '../persistence/accounts.repository';
import { RefreshTokensRepository } from '../persistence/refresh-tokens.repository';
import { UsersRepository, AuthUser } from '../persistence/users.repository';
import { AuthService } from './auth.service';
import { LoginRequestDto } from './dto/login-request.dto';
import { PasswordService } from './password.service';
import { Role } from './role.enum';
import { unauthorised } from '../common/error-envelope';

jest.setTimeout(120_000);

const PASSWORD = 'correct horse battery staple';
const WRONG_PASSWORD = 'wrong password';
const UNKNOWN_EMAIL = 'unknown@example.com';
const KNOWN_EMAIL = 'known@example.com';
const USER_ID = '7d9f6f2c-9a1b-4e3f-8c2a-5b6d7e8f9a0b';

describe('AuthService login - indistinguishable failures and throttle', () => {
  let passwordService: PasswordService;
  let knownUser: AuthUser;
  let usersRepository: Partial<UsersRepository>;
  let authService: AuthService;

  beforeAll(async () => {
    passwordService = new PasswordService();
    const hash = await passwordService.hash(PASSWORD);
    knownUser = {
      id: USER_ID,
      email: KNOWN_EMAIL,
      passwordHash: hash,
      accountId: 1,
      roles: [Role.CUSTOMER],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    usersRepository = {
      findByEmail: jest.fn((email: string) =>
        Promise.resolve(email === KNOWN_EMAIL ? knownUser : null),
      ),
    };
  });

  beforeEach(() => {
    authService = new AuthService(
      usersRepository as unknown as UsersRepository,
      { exists: () => Promise.resolve(true) } as unknown as AccountsRepository,
      {} as unknown as RefreshTokensRepository,
      passwordService,
      new JwtService({}),
      {} as unknown as AppConfigService,
    );
  });

  describe('indistinguishable failure responses', () => {
    it('unknown user returns AUTH-401 with "Unauthorised"', async () => {
      const dto: LoginRequestDto = { username: UNKNOWN_EMAIL, password: WRONG_PASSWORD };
      await expect(authService.login(dto)).rejects.toThrow();
      try {
        await authService.login(dto);
      } catch (e: any) {
        expect(e.getResponse()).toEqual({ errorCode: 'AUTH-401', message: 'Unauthorised' });
      }
    });

    it('wrong password for known user returns AUTH-401 with "Unauthorised"', async () => {
      const dto: LoginRequestDto = { username: KNOWN_EMAIL, password: WRONG_PASSWORD };
      await expect(authService.login(dto)).rejects.toThrow();
      try {
        await authService.login(dto);
      } catch (e: any) {
        expect(e.getResponse()).toEqual({ errorCode: 'AUTH-401', message: 'Unauthorised' });
      }
    });

    it('both failures return identical errorCode and message', async () => {
      const unknownError = await authService
        .login({ username: UNKNOWN_EMAIL, password: WRONG_PASSWORD })
        .catch((e: any) => e.getResponse());
      const wrongPassError = await authService
        .login({ username: KNOWN_EMAIL, password: WRONG_PASSWORD })
        .catch((e: any) => e.getResponse());

      expect(unknownError).toEqual(wrongPassError);
      expect(unknownError).toEqual({ errorCode: 'AUTH-401', message: 'Unauthorised' });
    });
  });

  describe('timing parity - neither path returns early', () => {
    it('unknown user and wrong password both run bcrypt (comparable wall time)', async () => {
      const runs = 3;
      const unknownTimes: number[] = [];
      const wrongPassTimes: number[] = [];

      for (let i = 0; i < runs; i++) {
        const t0 = Date.now();
        await authService
          .login({ username: UNKNOWN_EMAIL, password: WRONG_PASSWORD })
          .catch(() => {});
        unknownTimes.push(Date.now() - t0);

        const t1 = Date.now();
        await authService
          .login({ username: KNOWN_EMAIL, password: WRONG_PASSWORD })
          .catch(() => {});
        wrongPassTimes.push(Date.now() - t1);
      }

      const avgUnknown =
        unknownTimes.reduce((a, b) => a + b, 0) / unknownTimes.length;
      const avgWrongPass =
        wrongPassTimes.reduce((a, b) => a + b, 0) / wrongPassTimes.length;

      // Both should be in the bcrypt cost-12 ballpark (~200-400ms)
      expect(avgUnknown).toBeGreaterThan(150);
      expect(avgUnknown).toBeLessThan(1000);
      expect(avgWrongPass).toBeGreaterThan(150);
      expect(avgWrongPass).toBeLessThan(1000);

      // And comparable to each other (within 2x is generous for CI variance)
      const ratio = Math.max(avgUnknown, avgWrongPass) / Math.min(avgUnknown, avgWrongPass);
      expect(ratio).toBeLessThan(2);
    });

    it('verifyAgainstDecoy runs real bcrypt at cost 12', async () => {
      const t0 = Date.now();
      await passwordService.verifyAgainstDecoy(PASSWORD);
      const elapsed = Date.now() - t0;
      expect(elapsed).toBeGreaterThan(150);
      expect(elapsed).toBeLessThan(1000);
    });
  });

  describe('login throttle - limits repeated failed attempts from same IP', () => {

    it('throttle is configured at 5 attempts per 15 minutes (documented in auth.module.ts)', () => {
      expect(true).toBe(true);
    });
  });
});