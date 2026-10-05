import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Session } from '../../core/session/session';
import { Component, input } from '@angular/core';
import { LoginComponent } from './login.component';
import { AuthLayoutComponent } from '../auth-layout/auth-layout.component';

/** The layout's tabs need a real router; these tests are about the form only. */
@Component({ selector: 'app-auth-layout', template: '<ng-content />' })
class AuthLayoutStub {
  readonly active = input<string>();
}

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let signIn: ReturnType<typeof vi.fn>;
  let navigateByUrl: ReturnType<typeof vi.fn>;
  let queryParamMap: Map<string, string>;

  beforeEach(async () => {
    signIn = vi.fn().mockResolvedValue(undefined);
    navigateByUrl = vi.fn().mockResolvedValue(true);
    queryParamMap = new Map();
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: Session, useValue: { signIn } },
        { provide: Router, useValue: { navigateByUrl } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (key: string) => queryParamMap.get(key) || null,
              },
            },
          },
        },
      ],
    })
      .overrideComponent(LoginComponent, {
        remove: { imports: [AuthLayoutComponent] },
        add: { imports: [AuthLayoutStub] },
      })
      .compileComponents();
    fixture = TestBed.createComponent(LoginComponent);
    await fixture.whenStable();
  });

  function byTestId<T extends HTMLElement>(id: string): T | null {
    return (fixture.nativeElement as HTMLElement).querySelector<T>(`[data-testid="${id}"]`);
  }

  function type(id: string, value: string): void {
    const input = byTestId<HTMLInputElement>(id)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  async function submit(): Promise<void> {
    byTestId<HTMLButtonElement>('login-submit')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('valid credentials sign in and redirect to dashboard by default', async () => {
    type('login-username', 'john.carter@example.com');
    type('login-password', 'seed-password-change-me');

    await submit();

    expect(signIn).toHaveBeenCalledWith('john.carter@example.com', 'seed-password-change-me');
    expect(navigateByUrl).toHaveBeenCalledWith('/dashboard');
    expect(byTestId('login-error')).toBeNull();
  });

  it('valid credentials sign in and redirect to return URL if provided', async () => {
    queryParamMap.set('returnUrl', '/portfolio');
    type('login-username', 'john.carter@example.com');
    type('login-password', 'seed-password-change-me');

    await submit();

    expect(signIn).toHaveBeenCalledWith('john.carter@example.com', 'seed-password-change-me');
    expect(navigateByUrl).toHaveBeenCalledWith('/portfolio');
    expect(byTestId('login-error')).toBeNull();
  });

  it('invalid credentials show a readable error', async () => {
    signIn.mockRejectedValue(
      new HttpErrorResponse({
        status: 401,
        error: { errorCode: 'AUTH-401', message: 'Unauthorised' },
      }),
    );
    type('login-username', 'john.carter@example.com');
    type('login-password', 'wrong-password');

    await submit();

    const error = byTestId('login-error')!.textContent!;
    expect(error).toContain('did not sign you in');
    expect(error).not.toContain('Unauthorised');
    expect(navigateByUrl).not.toHaveBeenCalled();
    // The rejected password is not left in the field.
    expect(byTestId<HTMLInputElement>('login-password')!.value).toBe('');
  });

  it('empty fields are blocked by validation', async () => {
    await submit();

    expect(signIn).not.toHaveBeenCalled();
    expect(byTestId('login-username-error')!.textContent).toContain('Enter your email address');
    expect(byTestId('login-password-error')!.textContent).toContain('Enter your password');
  });

  it('a malformed email is blocked by validation', async () => {
    type('login-username', 'not-an-email');
    type('login-password', 'seed-password-change-me');

    await submit();

    expect(signIn).not.toHaveBeenCalled();
    expect(byTestId('login-username-error')!.textContent).toContain('valid email address');
  });

  it('an unreachable service shows a readable error', async () => {
    signIn.mockRejectedValue(new HttpErrorResponse({ status: 0 }));
    type('login-username', 'john.carter@example.com');
    type('login-password', 'seed-password-change-me');

    await submit();

    expect(byTestId('login-error')!.textContent).toContain('could not be reached');
  });

  it('a throttled sign-in says how long to wait', async () => {
    signIn.mockRejectedValue(
      new HttpErrorResponse({
        status: 401,
        headers: new HttpHeaders({ 'Retry-After': '600' }),
        error: { errorCode: 'AUTH-401', message: 'Unauthorised' },
      }),
    );
    type('login-username', 'john.carter@example.com');
    type('login-password', 'wrong-password');

    await submit();

    expect(byTestId('login-error')!.textContent).toContain('Wait 10 minutes');
  });
});
