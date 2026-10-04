import { Test, TestingModule } from '@nestjs/testing';
import { ProfileService } from './profile.service';
import { UsersRepository } from '../persistence/users.repository';
import { AccountsRepository } from '../persistence/accounts.repository';
import { unauthorised } from '../common/error-envelope';
import { Role } from './role.enum';

describe('ProfileService', () => {
  let service: ProfileService;
  let usersRepository: UsersRepository;
  let accountsRepository: AccountsRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        {
          provide: UsersRepository,
          useValue: {
            findById: jest.fn(),
          },
        },
        {
          provide: AccountsRepository,
          useValue: {
            findAccountIdForUser: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ProfileService>(ProfileService);
    usersRepository = module.get<UsersRepository>(UsersRepository);
    accountsRepository = module.get<AccountsRepository>(AccountsRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getProfile', () => {
    it('should return the signed-in user profile with all details', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const claims = { sub: userId };
      const user = {
        id: userId,
        name: 'Priya Menon',
        email: 'priya.menon@example.com',
        phone: '+1-555-1234',
        passwordHash: 'hashed_password',
        status: 'ACTIVE' as const,
        roles: [Role.CUSTOMER],
        createdAt: new Date('2024-01-15T10:00:00Z'),
      };

      jest.spyOn(usersRepository, 'findById').mockResolvedValue(user);
      jest.spyOn(accountsRepository, 'findAccountIdForUser').mockResolvedValue(1);

      const result = await service.getProfile(claims as any);

      expect(result).toEqual({
        id: userId,
        name: 'Priya Menon',
        email: 'priya.menon@example.com',
        phone: '+1-555-1234',
        role: Role.CUSTOMER,
        accountId: 1,
        joiningDate: '2024-01-15T10:00:00.000Z',
      });
    });

    it('should return undefined for missing phone', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const claims = { sub: userId };
      const user = {
        id: userId,
        name: 'John Doe',
        email: 'john.doe@example.com',
        phone: undefined,
        passwordHash: 'hashed_password',
        status: 'ACTIVE' as const,
        roles: [Role.CUSTOMER],
        createdAt: new Date('2024-01-15T10:00:00Z'),
      };

      jest.spyOn(usersRepository, 'findById').mockResolvedValue(user);
      jest.spyOn(accountsRepository, 'findAccountIdForUser').mockResolvedValue(null);

      const result = await service.getProfile(claims as any);

      expect(result.phone).toBeUndefined();
      expect(result.accountId).toBeUndefined();
    });

    it('should throw unauthorised if user does not exist', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const claims = { sub: userId };

      jest.spyOn(usersRepository, 'findById').mockResolvedValue(null);

      await expect(service.getProfile(claims as any)).rejects.toThrow(unauthorised);
    });

    it('should throw unauthorised if user is not ACTIVE', async () => {
      const userId = '123e4567-e89b-12d3-a456-426614174000';
      const claims = { sub: userId };
      const user = {
        id: userId,
        name: 'Suspended User',
        email: 'suspended@example.com',
        phone: undefined,
        passwordHash: 'hashed_password',
        status: 'SUSPENDED' as const,
        roles: [Role.CUSTOMER],
        createdAt: new Date('2024-01-15T10:00:00Z'),
      };

      jest.spyOn(usersRepository, 'findById').mockResolvedValue(user);

      await expect(service.getProfile(claims as any)).rejects.toThrow(unauthorised);
    });
  });
});
