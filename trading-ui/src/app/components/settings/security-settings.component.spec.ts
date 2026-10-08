import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthApi } from '../../api/auth-api';
import { Session } from '../../core/session/session';
import {
  SecuritySettingsComponent,
  WRONG_CURRENT_PASSWORD,
} from './security-settings.component';

// LEAP-010: change the password (current one required, registration length rules) and sign
// out everywhere. Both end this session too, and return to sign-in.
describe('SecuritySettingsComponent', () => {
  let fixture: ComponentFixture<SecuritySettingsComponent>;
  let changePassword: ReturnType<typeof vi.fn>;
  let logoutAll: ReturnType<typeof vi.fn>;
  const signOut = vi.fn();

  beforeEach(async () => {
    changePassword = vi.fn().mockReturnValue(of(undefined));
    logoutAll = vi.fn().mockReturnValue(of(undefined));
    signOut.mockClear();
    await TestBed.configureTestingModule({
      imports: [SecuritySettingsComponent],
      providers: [
        provideRouter([]),
        { provide: AuthApi, useValue: { changePassword, logoutAll } },
        {
          provide: Session,
          useValue: { user: () => ({ username: 'priya@example.com' }), signOut },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SecuritySettingsComponent);
    fixture.detectChanges();
  });

  const c = () => fixture.componentInstance;
  const fill = (current: string, next: string, confirm = next) =>
    c()['form'].setValue({ currentPassword: current, newPassword: next, confirmPassword: confirm });

  it('a short or mismatched new password is blocked before anything is sent', async () => {
    fill('old password here', 'short');
    await c().changePassword();
    fill('old password here', 'a long new password', 'another long password');
    await c().changePassword();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('a password change sends the current and new password, then signs this session out', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fill('old password here', 'a long new password');

    await c().changePassword();

    expect(changePassword).toHaveBeenCalledWith(
      'priya@example.com',
      'old password here',
      'a long new password',
    );
    expect(signOut).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { notice: 'password-changed' },
    });
  });

  it('a wrong current password is refused with its own sentence, and the session stays', async () => {
    changePassword.mockReturnValue(
      throwError(
        () => new HttpErrorResponse({ status: 401, error: { errorCode: 'AUTH-401', message: 'x' } }),
      ),
    );
    fill('wrong password!!', 'a long new password');

    await c().changePassword();

    expect(c()['passwordError']()).toBe(WRONG_CURRENT_PASSWORD);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('sign out everywhere asks first, then revokes every session and leaves', async () => {
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const el = (id: string) =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);

    el('logout-all')!.click();
    fixture.detectChanges();
    expect(logoutAll).not.toHaveBeenCalled();

    el('logout-all-yes')!.click();
    await fixture.whenStable();

    expect(logoutAll).toHaveBeenCalledTimes(1);
    expect(signOut).toHaveBeenCalled();
  });
});
