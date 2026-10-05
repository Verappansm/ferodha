import { HttpException, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProfileService } from './profile.service';
import { AuthUser, UsersRepository } from '../persistence/users.repository';
import { AccountsRepository } from '../persistence/accounts.repository';
import { AccessTokenClaims } from './access-token-claims';
import { Role } from './role.enum';

const USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const CLAIMS = { sub: USER_ID } as AccessTokenClaims;

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: USER_ID,
    name: 'Priya Menon',
    email: 'priya.menon@example.com',
    phone: '+91 98765 43210',
    passwordHash: 'hashed_password',
    status: 'ACTIVE',
    roles: [Role.CUSTOMER],
    createdAt: new Date('2024-01-15T10:00:00Z'),
    ...overrides,
  };
}

describe('ProfileService', () => {
  let service: ProfileService;
  let users: { findById: jest.Mock; updateProfile: jest.Mock };
  let accounts: { findAccountIdForUser: jest.Mock };

  beforeEach(async () => {
    users = { findById: jest.fn(), updateProfile: jest.fn() };
    accounts = { findAccountIdForUser: jest.fn().mockResolvedValue(1) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        { provide: UsersRepository, useValue: users },
        { provide: AccountsRepository, useValue: accounts },
      ],
    }).compile();
    service = module.get(ProfileService);
  });

  async function expectUnauthorised(promise: Promise<unknown>): Promise<void> {
    await expect(promise).rejects.toBeInstanceOf(HttpException);
    await promise.catch((error: HttpException) => {
      expect(error.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    });
  }

  describe('getProfile', () => {
    it('returns the signed-in user only, read from the token subject', async () => {
      users.findById.mockResolvedValue(user());

      const profile = await service.getProfile(CLAIMS);

      expect(users.findById).toHaveBeenCalledWith(USER_ID);
      expect(profile).toEqual({
        id: USER_ID,
        name: 'Priya Menon',
        email: 'priya.menon@example.com',
        phone: '+91 98765 43210',
        role: Role.CUSTOMER,
        accountId: 1,
        joiningDate: '2024-01-15T10:00:00.000Z',
      });
    });

    it('leaves the account out for a user who has none yet', async () => {
      users.findById.mockResolvedValue(user());
      accounts.findAccountIdForUser.mockResolvedValue(null);

      expect((await service.getProfile(CLAIMS)).accountId).toBeUndefined();
    });

    it('is AUTH-401 for a user that does not exist', async () => {
      users.findById.mockResolvedValue(null);
      await expectUnauthorised(service.getProfile(CLAIMS));
    });

    it('is AUTH-401 for a user that is not ACTIVE', async () => {
      users.findById.mockResolvedValue(user({ status: 'SUSPENDED' }));
      await expectUnauthorised(service.getProfile(CLAIMS));
    });
  });

  describe('updateProfile', () => {
    it('changes the name and phone of the signed-in user and returns the new profile', async () => {
      users.findById.mockResolvedValue(user());
      users.updateProfile.mockResolvedValue(
        user({ name: 'Priya M', phone: '+44 20 7946 0000' }),
      );

      const profile = await service.updateProfile(CLAIMS, {
        name: 'Priya M',
        phone: '+44 20 7946 0000',
      });

      expect(users.updateProfile).toHaveBeenCalledWith(USER_ID, {
        name: 'Priya M',
        phone: '+44 20 7946 0000',
      });
      expect(profile.name).toBe('Priya M');
      expect(profile.phone).toBe('+44 20 7946 0000');
    });

    it('clears the phone when it is sent empty, and leaves an omitted field alone', async () => {
      users.findById.mockResolvedValue(user());
      users.updateProfile.mockResolvedValue(user({ phone: undefined }));

      await service.updateProfile(CLAIMS, { phone: '' });

      expect(users.updateProfile).toHaveBeenCalledWith(USER_ID, {
        name: undefined,
        phone: null,
      });
    });

    it('never writes for a user that is not ACTIVE', async () => {
      users.findById.mockResolvedValue(user({ status: 'SUSPENDED' }));

      await expectUnauthorised(service.updateProfile(CLAIMS, { name: 'X' }));
      expect(users.updateProfile).not.toHaveBeenCalled();
    });
  });
});
