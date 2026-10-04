import { TestBed } from '@angular/core/testing';
import { ProfileApiService } from './profile-api.service';
import { ProfileService } from './generated/auth/api/profile.service';
import { of } from 'rxjs';

describe('ProfileApiService', () => {
  let service: ProfileApiService;
  let generatedProfileService: jasmine.SpyObj<ProfileService>;

  const mockUserProfile = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    username: 'priya.menon@example.com',
    name: 'Priya Menon',
    email: 'priya.menon@example.com',
    phone: '+1-555-1234',
    role: 'CUSTOMER',
    accountId: 1,
    joiningDate: '2024-01-15T10:00:00.000Z',
  };

  beforeEach(() => {
    const profileServiceSpy = jasmine.createSpyObj('ProfileService', [
      'getCurrentUser',
    ]);

    TestBed.configureTestingModule({
      providers: [
        ProfileApiService,
        { provide: ProfileService, useValue: profileServiceSpy },
      ],
    });

    service = TestBed.inject(ProfileApiService);
    generatedProfileService = TestBed.inject(
      ProfileService
    ) as jasmine.SpyObj<ProfileService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getProfile', () => {
    it('should call the generated profile service getCurrentUser', (done) => {
      generatedProfileService.getCurrentUser.and.returnValue(
        of(mockUserProfile)
      );

      service.getProfile().subscribe((profile) => {
        expect(generatedProfileService.getCurrentUser).toHaveBeenCalled();
        expect(profile).toEqual(mockUserProfile);
        done();
      });
    });

    it('should return user profile with all fields', (done) => {
      generatedProfileService.getCurrentUser.and.returnValue(
        of(mockUserProfile)
      );

      service.getProfile().subscribe((profile) => {
        expect(profile.id).toBe(mockUserProfile.id);
        expect(profile.email).toBe(mockUserProfile.email);
        expect(profile.accountId).toBe(mockUserProfile.accountId);
        done();
      });
    });
  });

  describe('updateProfile', () => {
    it('should return a successful observable', (done) => {
      const updateData = { name: 'Updated Name', phone: '+1-555-5678' };

      service.updateProfile(updateData).subscribe((response) => {
        expect(response).toEqual({});
        done();
      });
    });

    it('should handle partial updates with only name', (done) => {
      const updateData = { name: 'Updated Name' };

      service.updateProfile(updateData).subscribe(() => {
        done();
      });
    });

    it('should handle partial updates with only phone', (done) => {
      const updateData = { phone: '+1-555-5678' };

      service.updateProfile(updateData).subscribe(() => {
        done();
      });
    });

    it('should handle empty update request', (done) => {
      service.updateProfile({}).subscribe(() => {
        done();
      });
    });
  });
});
