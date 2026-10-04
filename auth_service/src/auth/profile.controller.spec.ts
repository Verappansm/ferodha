import { Test, TestingModule } from '@nestjs/testing';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AccessTokenClaims } from './access-token-claims';
import { Role } from './role.enum';

const CLAIMS = {
  sub: '123e4567-e89b-12d3-a456-426614174000',
} as AccessTokenClaims;
const PROFILE = {
  id: CLAIMS.sub,
  name: 'Priya Menon',
  email: 'priya.menon@example.com',
  phone: '+91 98765 43210',
  role: Role.CUSTOMER,
  accountId: 1,
  joiningDate: '2024-01-15T10:00:00.000Z',
};

describe('ProfileController', () => {
  let controller: ProfileController;
  let profileService: { getProfile: jest.Mock; updateProfile: jest.Mock };

  beforeEach(async () => {
    profileService = {
      getProfile: jest.fn().mockResolvedValue(PROFILE),
      updateProfile: jest.fn().mockResolvedValue(PROFILE),
    };
    // The guard itself is covered by jwt-auth.guard.spec.ts.
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [{ provide: ProfileService, useValue: profileService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(ProfileController);
  });

  it('returns the profile of the verified token', async () => {
    await expect(controller.getProfile(CLAIMS)).resolves.toEqual(PROFILE);
    expect(profileService.getProfile).toHaveBeenCalledWith(CLAIMS);
  });

  it('passes the edit and the verified token to the service', async () => {
    await controller.updateProfile(CLAIMS, { name: 'Priya Menon' });
    expect(profileService.updateProfile).toHaveBeenCalledWith(CLAIMS, {
      name: 'Priya Menon',
    });
  });
});
