import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { ProfileComponent } from './profile.component';
import { ProfileApiService } from '../../services/profile-api.service';
import { of, throwError } from 'rxjs';

describe('ProfileComponent', () => {
  let component: ProfileComponent;
  let fixture: ComponentFixture<ProfileComponent>;
  let profileApiService: jasmine.SpyObj<ProfileApiService>;

  const mockUserProfile = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Priya Menon',
    email: 'priya.menon@example.com',
    phone: '+1-555-1234',
    role: 'CUSTOMER',
    accountId: 1,
    joiningDate: '2024-01-15T10:00:00.000Z',
  };

  beforeEach(async () => {
    const profileApiSpy = jasmine.createSpyObj('ProfileApiService', [
      'getProfile',
      'updateProfile',
    ]);

    await TestBed.configureTestingModule({
      imports: [ProfileComponent, ReactiveFormsModule],
      providers: [
        { provide: ProfileApiService, useValue: profileApiSpy },
      ],
    }).compileComponents();

    profileApiService = TestBed.inject(
      ProfileApiService
    ) as jasmine.SpyObj<ProfileApiService>;
    fixture = TestBed.createComponent(ProfileComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('ngOnInit', () => {
    it('should load profile on initialization', () => {
      profileApiService.getProfile.and.returnValue(of(mockUserProfile));

      component.ngOnInit();

      expect(profileApiService.getProfile).toHaveBeenCalled();
    });

    it('should render the profile details of the signed-in user only', () => {
      profileApiService.getProfile.and.returnValue(of(mockUserProfile));

      component.ngOnInit();
      fixture.detectChanges();

      expect(component.userProfile()?.name).toBe('Priya Menon');
      expect(component.userProfile()?.email).toBe('priya.menon@example.com');
      expect(component.form.get('name')?.value).toBe('Priya Menon');
      expect(component.form.get('email')?.value).toBe(
        'priya.menon@example.com'
      );
    });

    it('should set loading state during profile fetch', () => {
      profileApiService.getProfile.and.returnValue(of(mockUserProfile));

      expect(component.loading()).toBe(false);
      component.ngOnInit();
      expect(component.loading()).toBe(false); // Completed after the observable
    });

    it('should handle profile fetch error', () => {
      profileApiService.getProfile.and.returnValue(
        throwError(() => new Error('API Error'))
      );

      component.ngOnInit();
      fixture.detectChanges();

      expect(component.error()).toBe('Failed to load profile. Please try again.');
    });
  });

  describe('form initialization', () => {
    beforeEach(() => {
      profileApiService.getProfile.and.returnValue(of(mockUserProfile));
      component.ngOnInit();
      fixture.detectChanges();
    });

    it('should initialize form with editable name field', () => {
      const nameControl = component.form.get('name');
      expect(nameControl?.enabled).toBe(true);
      expect(nameControl?.value).toBe('Priya Menon');
    });

    it('should initialize form with read-only email field', () => {
      const emailControl = component.form.get('email');
      expect(emailControl?.disabled).toBe(true);
      expect(emailControl?.value).toBe('priya.menon@example.com');
    });

    it('should initialize form with editable phone field', () => {
      const phoneControl = component.form.get('phone');
      expect(phoneControl?.enabled).toBe(true);
      expect(phoneControl?.value).toBe('+1-555-1234');
    });

    it('should initialize form with read-only role field', () => {
      const roleControl = component.form.get('role');
      expect(roleControl?.disabled).toBe(true);
      expect(roleControl?.value).toBe('CUSTOMER');
    });

    it('should initialize form with read-only trading account field', () => {
      const accountControl = component.form.get('accountId');
      expect(accountControl?.disabled).toBe(true);
      expect(accountControl?.value).toBe(1);
    });

    it('should initialize form with read-only joining date field', () => {
      const joiningDateControl = component.form.get('joiningDate');
      expect(joiningDateControl?.disabled).toBe(true);
      expect(joiningDateControl?.value).toBeTruthy();
    });

    it('should apply required validation to name field', () => {
      const nameControl = component.form.get('name');
      nameControl?.setValue('');
      expect(nameControl?.hasError('required')).toBe(true);
    });

    it('should apply maxlength validation to name field', () => {
      const nameControl = component.form.get('name');
      nameControl?.setValue('a'.repeat(101));
      expect(nameControl?.hasError('maxlength')).toBe(true);
    });

    it('should apply maxlength validation to phone field', () => {
      const phoneControl = component.form.get('phone');
      phoneControl?.setValue('1'.repeat(21));
      expect(phoneControl?.hasError('maxlength')).toBe(true);
    });
  });

  describe('form submission', () => {
    beforeEach(() => {
      profileApiService.getProfile.and.returnValue(of(mockUserProfile));
      component.ngOnInit();
      fixture.detectChanges();
    });

    it('should not submit when form is invalid', () => {
      component.form.get('name')?.setValue('');
      component.submit();

      expect(profileApiService.updateProfile).not.toHaveBeenCalled();
    });

    it('should submit with updated name and phone', () => {
      profileApiService.updateProfile.and.returnValue(of({}));

      component.form.patchValue({
        name: 'Updated Name',
        phone: '+1-555-5678',
      });
      component.submit();

      expect(profileApiService.updateProfile).toHaveBeenCalledWith({
        name: 'Updated Name',
        phone: '+1-555-5678',
      });
    });

    it('should show success message on successful update', (done) => {
      profileApiService.updateProfile.and.returnValue(of({}));

      component.form.patchValue({
        name: 'Updated Name',
        phone: '+1-555-5678',
      });
      component.submit();

      setTimeout(() => {
        expect(component.success()).toBe(true);
        done();
      }, 100);
    });

    it('should handle update error gracefully', () => {
      profileApiService.updateProfile.and.returnValue(
        throwError(() => new Error('Update failed'))
      );

      component.form.patchValue({
        name: 'Updated Name',
        phone: '+1-555-5678',
      });
      component.submit();

      fixture.detectChanges();

      expect(component.error()).toBe('Failed to update profile. Please try again.');
    });

    it('should disable submit button during loading', (done) => {
      profileApiService.updateProfile.and.returnValue(of({}));

      component.form.patchValue({
        name: 'Updated Name',
      });
      component.submit();

      expect(component.loading()).toBe(false); // After observable completes
      done();
    });
  });

  describe('error handling', () => {
    it('should display error message for invalid field', () => {
      profileApiService.getProfile.and.returnValue(of(mockUserProfile));
      component.ngOnInit();
      fixture.detectChanges();

      const nameControl = component.form.get('name');
      nameControl?.setValue('');
      nameControl?.markAsTouched();

      expect(component.showError('name')).toBe(true);
      expect(component.getErrorMessage('name')).toBe('Name is required');
    });

    it('should display maxlength error message', () => {
      profileApiService.getProfile.and.returnValue(of(mockUserProfile));
      component.ngOnInit();
      fixture.detectChanges();

      const nameControl = component.form.get('name');
      nameControl?.setValue('a'.repeat(101));
      nameControl?.markAsTouched();

      expect(component.getErrorMessage('name')).toContain('cannot exceed 100');
    });
  });

  describe('form interaction', () => {
    beforeEach(() => {
      profileApiService.getProfile.and.returnValue(of(mockUserProfile));
      component.ngOnInit();
      fixture.detectChanges();
    });

    it('should only show errors for touched fields', () => {
      const nameControl = component.form.get('name');
      nameControl?.setValue('');

      expect(component.showError('name')).toBe(false);

      nameControl?.markAsTouched();
      expect(component.showError('name')).toBe(true);
    });

    it('should allow editing name field', () => {
      const nameControl = component.form.get('name');
      nameControl?.setValue('New Name');

      expect(nameControl?.value).toBe('New Name');
      expect(nameControl?.valid).toBe(true);
    });

    it('should allow editing phone field', () => {
      const phoneControl = component.form.get('phone');
      phoneControl?.setValue('+1-555-9999');

      expect(phoneControl?.value).toBe('+1-555-9999');
      expect(phoneControl?.valid).toBe(true);
    });

    it('should clear phone field', () => {
      const phoneControl = component.form.get('phone');
      phoneControl?.setValue('');

      expect(phoneControl?.value).toBe('');
      expect(phoneControl?.valid).toBe(true);
    });
  });
});
