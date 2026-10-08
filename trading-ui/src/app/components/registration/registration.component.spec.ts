import { HttpErrorResponse } from '@angular/common/http';
import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthApi } from '../../api/auth-api';
import { ERROR_MESSAGES } from '../../core/errors/error-message';
import { AuthLayoutComponent } from '../auth-layout/auth-layout.component';
import { RegistrationComponent } from './registration.component';

@Component({ selector: 'app-auth-layout', template: '<ng-content />' })
class AuthLayoutStub {
  readonly active = input<string>();
}

describe('RegistrationComponent', () => {
  let fixture: ComponentFixture<RegistrationComponent>;
  let register: ReturnType<typeof vi.fn>;
  let verifyEmail: ReturnType<typeof vi.fn>;
  let resendCode: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    register = vi.fn().mockReturnValue(of({}));
    verifyEmail = vi.fn().mockReturnValue(of(undefined));
    resendCode = vi.fn().mockReturnValue(of(undefined));
    await TestBed.configureTestingModule({
      imports: [RegistrationComponent],
      providers: [
        provideRouter([]),
        { provide: AuthApi, useValue: { register, verifyEmail, resendCode } },
      ],
    })
      .overrideComponent(RegistrationComponent, {
        remove: { imports: [AuthLayoutComponent] },
        add: { imports: [AuthLayoutStub] },
      })
      .compileComponents();
    fixture = TestBed.createComponent(RegistrationComponent);
    await fixture.whenStable();
  });

  function el<T extends HTMLElement>(id: string): T | null {
    return (fixture.nativeElement as HTMLElement).querySelector<T>(`[data-testid="${id}"]`);
  }

  function type(id: string, value: string): void {
    const input = el<HTMLInputElement>(id)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
  }

  function fill(password = 'a long enough passphrase', confirm = password): void {
    type('register-name', 'Priya Menon');
    type('register-email', 'Priya.Menon@Example.com');
    type('register-password', password);
    type('register-confirm', confirm);
  }

  async function submit(): Promise<void> {
    el<HTMLButtonElement>('register-submit')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function enterCode(code: string): Promise<void> {
    type('register-code', code);
    el<HTMLButtonElement>('register-verify-submit')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('a valid registration asks for the emailed code before anything else', async () => {
    fill();
    await submit();

    expect(register).toHaveBeenCalledWith(
      'Priya Menon',
      'Priya.Menon@Example.com',
      'a long enough passphrase',
    );
    expect(el('register-verify')?.textContent).toContain('priya.menon@example.com');
    expect(el('register-success')).toBeNull();
  });

  it('the right code verifies the email, then shows the awaiting-approval message', async () => {
    fill();
    await submit();
    await enterCode('123456');

    expect(verifyEmail).toHaveBeenCalledWith('priya.menon@example.com', '123456');
    expect(el('register-success')?.textContent).toContain('priya.menon@example.com');
    expect(el('register-success')?.textContent).toContain('operations');
  });

  it('a malformed code is refused locally; a wrong one says so and stays on the step', async () => {
    fill();
    await submit();

    await enterCode('12ab');
    expect(verifyEmail).not.toHaveBeenCalled();
    expect(el('register-code-error')?.textContent).toContain('6-digit');

    verifyEmail.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 422 })));
    await enterCode('000000');
    expect(el('register-code-error')?.textContent).toContain('wrong or has expired');
    expect(el('register-success')).toBeNull();
  });

  it('asks for a new code on request', async () => {
    fill();
    await submit();
    el<HTMLButtonElement>('register-resend')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(resendCode).toHaveBeenCalledWith('priya.menon@example.com');
    expect(el('register-resent')).not.toBeNull();
  });

  it('a taken email shows the AUTH-409 sentence', async () => {
    register.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({ status: 409, error: { errorCode: 'AUTH-409', message: 'x' } }),
      ),
    );
    fill();
    await submit();

    expect(el('register-error')?.textContent).toContain(ERROR_MESSAGES['AUTH-409']);
    expect(el('register-success')).toBeNull();
  });

  it('a short password is blocked before submission', async () => {
    fill('short', 'short');
    await submit();

    expect(register).not.toHaveBeenCalled();
    expect(el('register-password-error')?.textContent).toContain('between 12 and 128');
  });

  it('mismatched passwords are blocked before submission', async () => {
    fill('a long enough passphrase', 'a different passphrase');
    await submit();

    expect(register).not.toHaveBeenCalled();
    expect(el('register-confirm-error')?.textContent).toContain('do not match');
  });
});
