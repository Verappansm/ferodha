import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { ProfileComponent } from './profile.component';
import { ProfileApi, ProfileResponse } from '../../api/profile-api';
import { ERROR_MESSAGES } from '../../core/errors/error-message';

const PROFILE: ProfileResponse = {
  id: '6b1f0c3e-0000-4000-8000-000000000001',
  name: 'John Carter',
  email: 'john.carter@example.com',
  phone: '+1-202-555-0101',
  role: 'CUSTOMER',
  accountId: 1,
  joiningDate: '2026-01-15T10:00:00Z',
};

describe('ProfileComponent', () => {
  let fixture: ComponentFixture<ProfileComponent>;
  let get: ReturnType<typeof vi.fn>;
  let update: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    get = vi.fn().mockReturnValue(of(PROFILE));
    update = vi.fn((changes) => of({ ...PROFILE, ...changes }));
    await TestBed.configureTestingModule({
      imports: [ProfileComponent],
      providers: [{ provide: ProfileApi, useValue: { get, update } }],
    }).compileComponents();
  });

  function open(): void {
    fixture = TestBed.createComponent(ProfileComponent);
    fixture.detectChanges();
  }

  /** The profile opens read-only; the form appears after Edit Information. */
  function openEditor(): void {
    open();
    element<HTMLButtonElement>('profile-edit').click();
    fixture.detectChanges();
  }

  function element<T extends HTMLElement>(testId: string): T {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  }

  function text(testId: string): string {
    return element(testId)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  function type(testId: string, value: string): void {
    const input = element<HTMLInputElement>(testId);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
  }

  function save(): void {
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    fixture.detectChanges();
  }

  it('renders the details of the signed-in user only, as the auth service returns them', () => {
    open();
    expect(get).toHaveBeenCalledWith();
    expect(text('profile-email')).toBe('john.carter@example.com');
    expect(text('profile-account')).toBe('Account 1');
    expect(text('profile-details')).toContain('Customer');
    expect(text('profile-details')).toContain('2026');
    expect(text('profile-view-name')).toBe('John Carter');
    expect(text('profile-view-phone')).toBe('+1-202-555-0101');
  });

  it('opens read-only, with the form behind Edit Information, filled with the saved details', () => {
    open();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();

    element<HTMLButtonElement>('profile-edit').click();
    fixture.detectChanges();

    expect(element<HTMLInputElement>('profile-name').value).toBe('John Carter');
    expect(element<HTMLInputElement>('profile-phone').value).toBe('+1-202-555-0101');
  });

  it('shows the email but never offers it for editing', () => {
    openEditor();
    expect(fixture.nativeElement.querySelectorAll('input').length).toBe(2);
  });

  it('blocks an invalid phone number before submission', () => {
    openEditor();
    type('profile-phone', 'call me');
    save();
    expect(update).not.toHaveBeenCalled();
    expect(text('profile-phone-error')).toContain('Enter a phone number');
  });

  it('blocks a blank name before submission', () => {
    openEditor();
    type('profile-name', '   ');
    save();
    expect(update).not.toHaveBeenCalled();
    expect(text('profile-name-error')).toBe('Enter your name.');
  });

  it('saves the name and phone through the auth service, then shows them and says so', () => {
    openEditor();
    type('profile-name', 'John A. Carter');
    type('profile-phone', '+44 20 7946 0000');
    save();
    expect(update).toHaveBeenCalledWith({ name: 'John A. Carter', phone: '+44 20 7946 0000' });
    // Back to the read-only view, which carries the confirmation.
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(text('profile-saved')).toBe('Your profile is saved.');
    expect(text('profile-view-name')).toBe('John A. Carter');
    expect(text('profile-view-phone')).toBe('+44 20 7946 0000');
  });

  it('cancel discards the edit and any error, and saves nothing', () => {
    openEditor();
    type('profile-name', 'Somebody Else');
    element<HTMLButtonElement>('profile-cancel').click();
    fixture.detectChanges();

    expect(update).not.toHaveBeenCalled();
    expect(text('profile-view-name')).toBe('John Carter');
    element<HTMLButtonElement>('profile-edit').click();
    fixture.detectChanges();
    expect(element<HTMLInputElement>('profile-name').value).toBe('John Carter');
  });

  it('removes the phone when it is cleared', () => {
    openEditor();
    type('profile-phone', '');
    save();
    expect(update).toHaveBeenCalledWith({ name: 'John Carter', phone: '' });
  });

  it('shows the catalogue message when the save is refused, and keeps the edit', () => {
    update.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 422,
            error: { errorCode: 'VAL-422', message: 'Invalid input' },
          }),
      ),
    );
    openEditor();
    type('profile-name', 'John A. Carter');
    save();
    expect(text('profile-save-error')).toBe(ERROR_MESSAGES['VAL-422']);
    expect(element<HTMLInputElement>('profile-name').value).toBe('John A. Carter');
  });

  it('shows a readable message when the profile cannot be loaded', () => {
    get.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    open();
    expect(text('profile-load-error')).toContain('could not be reached');
  });
});
