import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { Session } from './core/session/session';
import { provideStubPreferences } from './core/preferences/preferences.testing';

describe('App', () => {
  const isSignedIn = signal(false);
  const signOut = vi.fn(() => isSignedIn.set(false));

  beforeEach(async () => {
    isSignedIn.set(false);
    signOut.mockClear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: Session,
          useValue: { isSignedIn, signOut, user: signal(null), accountId: signal(null) },
        },
        provideStubPreferences(),
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render navbar once signed in', async () => {
    isSignedIn.set(true);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.nav-brand')?.textContent).toContain('Ferodha');
  });

  it('offers no navigation or sign-out while signed out', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="sign-out"]')).toBeNull();
    expect(compiled.querySelector('.nav-links')).toBeNull();
  });

  it('signing out clears the session and returns to sign-in', async () => {
    isSignedIn.set(true);
    const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    // Sign-out lives in the account menu, which is closed until opened.
    expect(root.querySelector('[data-testid="sign-out"]')).toBeNull();
    root.querySelector<HTMLButtonElement>('[data-testid="account-menu"]')!.click();
    await fixture.whenStable();

    root.querySelector<HTMLButtonElement>('[data-testid="sign-out"]')!.click();
    await fixture.whenStable();

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledWith('/login');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="sign-out"]'),
    ).toBeNull();
  });

  it('the menu button folds the links open and shut, and Escape or a link closes them', async () => {
    isSignedIn.set(true);
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const toggle = root.querySelector<HTMLButtonElement>('[data-testid="nav-toggle"]')!;
    const panel = () => root.querySelector('#main-nav')!;

    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    await fixture.whenStable();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Close menu');
    expect(panel().classList).toContain('open');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(panel().classList).not.toContain('open');

    toggle.click();
    await fixture.whenStable();
    panel().querySelector<HTMLAnchorElement>('a[href="/orders"]')!.click();
    await fixture.whenStable();
    expect(panel().classList).not.toContain('open');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});
