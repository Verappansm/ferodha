import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { AdminSession } from '../session/admin-session';
import { adminGuard, REQUIRE_ADMIN_SIGN_IN, safeReturnUrl } from './admin.guard';

describe('adminGuard', () => {
  function run(requireSignIn: boolean, signedIn: boolean): boolean | UrlTree {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: REQUIRE_ADMIN_SIGN_IN, useValue: requireSignIn },
        { provide: AdminSession, useValue: { isSignedIn: () => signedIn } },
      ],
    });
    return TestBed.runInInjectionContext(
      () => adminGuard({} as never, { url: '/users' } as never) as boolean | UrlTree,
    );
  }

  it('sends a signed-out visitor to sign-in with the return address', () => {
    const result = run(true, false);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe(
      '/sign-in?returnUrl=%2Fusers',
    );
  });

  it('lets a signed-in administrator through', () => {
    expect(run(true, true)).toBe(true);
  });

  it('lets everyone through while sign-in is not enforced', () => {
    expect(run(false, false)).toBe(true);
  });
});

describe('safeReturnUrl', () => {
  it('follows a path inside the console', () => {
    expect(safeReturnUrl('/accounts?status=ACTIVE')).toBe('/accounts?status=ACTIVE');
  });

  it('refuses an address off this origin', () => {
    expect(safeReturnUrl('https://evil.example')).toBe('/');
    expect(safeReturnUrl('//evil.example')).toBe('/');
    expect(safeReturnUrl('/\\evil.example')).toBe('/');
    expect(safeReturnUrl(null)).toBe('/');
  });
});
