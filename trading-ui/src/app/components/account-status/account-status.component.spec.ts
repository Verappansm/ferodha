import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AccountStatusResponse, AuthApi } from '../../api/auth-api';
import { provideStubPreferences } from '../../core/preferences/preferences.testing';
import { AccountStatusComponent, STATUS_REFUSED } from './account-status.component';

// LEAP-012: each request state renders its own message, reachable signed out.
describe('AccountStatusComponent', () => {
  let fixture: ComponentFixture<AccountStatusComponent>;
  let accountStatus: ReturnType<typeof vi.fn>;
  let verifyEmail: ReturnType<typeof vi.fn>;

  const status = (s: Partial<AccountStatusResponse>): AccountStatusResponse => ({
    status: 'PENDING',
    reason: null,
    emailVerified: true,
    requestedAt: '2026-10-01T09:00:00Z',
    decidedAt: null,
    ...s,
  });

  beforeEach(async () => {
    accountStatus = vi.fn();
    verifyEmail = vi.fn().mockReturnValue(of(undefined));
    await TestBed.configureTestingModule({
      imports: [AccountStatusComponent],
      providers: [
        provideRouter([]),
        provideStubPreferences(),
        {
          provide: AuthApi,
          useValue: { accountStatus, verifyEmail, resendCode: vi.fn().mockReturnValue(of(undefined)) },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AccountStatusComponent);
    fixture.detectChanges();
  });

  const el = (id: string) =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(`[data-testid="${id}"]`);

  async function check(answer: AccountStatusResponse | HttpErrorResponse): Promise<void> {
    accountStatus.mockReturnValue(
      answer instanceof HttpErrorResponse ? throwError(() => answer) : of(answer),
    );
    fixture.componentInstance['form'].setValue({
      username: 'priya@example.com',
      password: 'correct horse battery staple',
    });
    await fixture.componentInstance.check();
    fixture.detectChanges();
  }

  it('asks with the email and password, and never signs the visitor in', async () => {
    await check(status({}));
    expect(accountStatus).toHaveBeenCalledWith('priya@example.com', 'correct horse battery staple');
  });

  it('a pending request waits for an administrator', async () => {
    await check(status({}));
    expect(el('status-pending')?.textContent).toContain('waiting for an administrator');
  });

  it('an approved request offers sign-in', async () => {
    await check(status({ status: 'APPROVED', decidedAt: '2026-10-02T10:00:00Z' }));
    expect(el('status-approved')).not.toBeNull();
    expect(el('status-signin')?.getAttribute('href')).toBe('/login');
  });

  it('a rejected request says why', async () => {
    await check(status({ status: 'REJECTED', reason: 'No bank account under this email.' }));
    expect(el('status-rejected')?.textContent).toContain('No bank account under this email.');
  });

  it('an unconfirmed email can be confirmed here, and the status is read again', async () => {
    await check(status({ emailVerified: false }));
    expect(el('status-unverified')).not.toBeNull();

    accountStatus.mockReturnValue(of(status({})));
    fixture.componentInstance.code.set('123456');
    await fixture.componentInstance.verify();
    fixture.detectChanges();

    expect(verifyEmail).toHaveBeenCalledWith('priya@example.com', '123456');
    expect(el('status-pending')).not.toBeNull();
  });

  it('a wrong email or password is one plain sentence', async () => {
    await check(
      new HttpErrorResponse({ status: 401, error: { errorCode: 'AUTH-401', message: 'x' } }),
    );
    expect(el('status-error')?.textContent).toContain(STATUS_REFUSED);
  });
});
