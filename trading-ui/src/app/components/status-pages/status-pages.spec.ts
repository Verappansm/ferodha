import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { GlobalErrorHandler } from '../../core/errors/global-error-handler';
import { roleGuard } from '../../core/guards/role.guard';
import { Session } from '../../core/session/session';
import { routes } from '../../app.routes';
import { HelpComponent, SUPPORT_EMAIL } from '../help/help.component';

@Component({ template: 'console' })
class ConsoleStub {}

function sessionStub(roles: string[]) {
  return { isSignedIn: () => true, roles: () => roles, accessToken: () => 't' };
}

describe('LEAP-025: the pages for a wrong turn', () => {
  it('an unknown path renders the not-found page, not a blank screen', async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: Session, useValue: sessionStub([]) }],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/no/such/page');

    const text = (harness.routeNativeElement as HTMLElement).textContent;
    expect(text).toContain('Page not found');
    expect(harness.routeNativeElement?.querySelector('a[href="/help"]')).not.toBeNull();
  });

  it('a customer opening a route that needs ADMIN lands on the forbidden page', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'ops', component: ConsoleStub, canActivate: [roleGuard('ADMIN')] },
          routes.find((r) => r.path === 'forbidden')!,
        ]),
        { provide: Session, useValue: sessionStub(['CUSTOMER']) },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/ops');

    expect(TestBed.inject(Router).url).toBe('/forbidden');
    expect((harness.routeNativeElement as HTMLElement).textContent).toContain(
      "You can't open this page",
    );
  });

  it('an administrator is let through the same route', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: 'ops', component: ConsoleStub, canActivate: [roleGuard('ADMIN')] }]),
        { provide: Session, useValue: sessionStub(['ADMIN']) },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/ops');

    expect(TestBed.inject(Router).url).toBe('/ops');
  });

  describe('the global error handler', () => {
    function setup(url: string) {
      const navigateByUrl = vi.fn().mockResolvedValue(true);
      TestBed.configureTestingModule({
        providers: [GlobalErrorHandler, { provide: Router, useValue: { url, navigateByUrl } }],
      });
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      return { handler: TestBed.inject(GlobalErrorHandler), navigateByUrl };
    }

    it('an unexpected failure shows the error page', () => {
      const { handler, navigateByUrl } = setup('/portfolio');
      handler.handleError(new TypeError('boom'));
      expect(navigateByUrl).toHaveBeenCalledWith('/error');
    });

    it('an HTTP failure is left to the screen that made the call', () => {
      const { handler, navigateByUrl } = setup('/portfolio');
      handler.handleError(new HttpErrorResponse({ status: 500 }));
      expect(navigateByUrl).not.toHaveBeenCalled();
    });

    it('a failure on the error page itself does not loop', () => {
      const { handler, navigateByUrl } = setup('/error');
      handler.handleError(new Error('again'));
      expect(navigateByUrl).not.toHaveBeenCalled();
    });
  });
});

describe('LEAP-026: the help page', () => {
  it('answers the common questions and says how to reach support', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(HelpComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    for (const id of ['faq-order', 'faq-approval', 'faq-fees', 'faq-bank']) {
      expect(el.querySelector(`[data-testid="${id}"] summary`)?.textContent?.trim()).toMatch(/\?$/);
    }
    expect(el.querySelector('[data-testid="faq-approval"]')?.textContent).toContain('6-digit code');
    expect(el.querySelector('[data-testid="support-email"]')?.getAttribute('href')).toBe(
      `mailto:${SUPPORT_EMAIL}`,
    );
  });

  it('is reachable without signing in', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        { provide: Session, useValue: { isSignedIn: () => false, roles: () => [] } },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/help');

    expect(TestBed.inject(Router).url).toBe('/help');
    expect((harness.routeNativeElement as HTMLElement).textContent).toContain('Help and support');
  });
});
