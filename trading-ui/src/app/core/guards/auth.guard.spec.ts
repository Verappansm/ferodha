import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { authGuard } from './auth.guard';
import { Session } from '../session/session';

describe('authGuard', () => {
  const isSignedIn = signal(false);
  let router: Router;

  beforeEach(() => {
    isSignedIn.set(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: Session, useValue: { isSignedIn } },
        {
          provide: Router,
          useValue: { navigate: vi.fn() },
        },
      ],
    });
    router = TestBed.inject(Router);
  });

  it('blocks unauthenticated navigation and redirects to sign-in with return URL', () => {
    const url = '/dashboard';
    const route = {} as any;
    const state = { url } as any;

    const result = TestBed.runInInjectionContext(() => authGuard(route, state));

    expect(result).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: url },
      queryParamsHandling: 'merge',
    });
  });

  it('blocks unauthenticated navigation without return URL if it is off-origin', () => {
    const route = {} as any;
    const offOriginUrls = [
      'https://attacker.com/phishing',
      'http://localhost:3000/admin',
      '//attacker.com/steal',
      'javascript:alert("xss")',
    ];

    offOriginUrls.forEach((url) => {
      (router.navigate as any).mockClear();

      const state = { url } as any;
      const result = TestBed.runInInjectionContext(() => authGuard(route, state));

      expect(result).toBe(false);
      expect(router.navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: {},
        queryParamsHandling: 'merge',
      });
    });
  });

  it('rejects return address that is not a path on this origin', () => {
    const offOriginUrls = [
      'https://attacker.com/phishing',
      'http://localhost:3000/admin',
      '//attacker.com/steal',
      'javascript:alert("xss")',
      'data:text/html,<script>alert("xss")</script>',
    ];

    offOriginUrls.forEach((url) => {
      (router.navigate as any).mockClear();
      const route = {} as any;
      const state = { url } as any;

      const result = TestBed.runInInjectionContext(() => authGuard(route, state));

      expect(result).toBe(false);
      // Should NOT include the URL in query params
      const callArgs = (router.navigate as any).mock.calls[0];
      expect(callArgs[1].queryParams).toEqual({});
    });
  });

  it('accepts valid same-origin return addresses', () => {
    const validUrls = ['/dashboard', '/portfolio', '/orders', '/settings', '/instruments/123'];

    validUrls.forEach((url) => {
      (router.navigate as any).mockClear();
      const route = {} as any;
      const state = { url } as any;

      const result = TestBed.runInInjectionContext(() => authGuard(route, state));

      expect(result).toBe(false);
      // Should include the URL in query params
      expect(router.navigate).toHaveBeenCalledWith(['/login'], {
        queryParams: { returnUrl: url },
        queryParamsHandling: 'merge',
      });
    });
  });

  it('allows authenticated navigation', () => {
    isSignedIn.set(true);
    const route = {} as any;
    const state = { url: '/dashboard' } as any;

    const result = TestBed.runInInjectionContext(() => authGuard(route, state));

    expect(result).toBe(true);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('allows authenticated navigation even to protected routes', () => {
    isSignedIn.set(true);
    const protectedUrls = ['/portfolio', '/orders', '/settings', '/instruments/456'];

    protectedUrls.forEach((url) => {
      (router.navigate as any).mockClear();
      const route = {} as any;
      const state = { url } as any;

      const result = TestBed.runInInjectionContext(() => authGuard(route, state));

      expect(result).toBe(true);
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });
});
