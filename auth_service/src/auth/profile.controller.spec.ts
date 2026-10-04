import { Test, TestingModule } from '@nestjs/testing';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { Role } from './role.enum';

describe('ProfileController', () => {
  let controller: ProfileController;
  let profileService: ProfileService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        {
          provide: ProfileService,
          useValue: {
            getProfile: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ProfileController>(ProfileController);
    profileService = module.get<ProfileService>(ProfileService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProfile', () => {
    it('should return the user profile', async () => {
      const claims = { sub: '123e4567-e89b-12d3-a456-426614174000' };
      const profileResponse = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Priya Menon',
        email: 'priya.menon@example.com',
        phone: '+1-555-1234',
        role: Role.CUSTOMER,
        accountId: 1,
        joiningDate: '2024-01-15T10:00:00.000Z',
      };

      jest.spyOn(profileService, 'getProfile').mockResolvedValue(profileResponse);

      const result = await controller.getProfile(claims as any);

      expect(result).toEqual(profileResponse);
      expect(profileService.getProfile).toHaveBeenCalledWith(claims);
    });
  });
});
