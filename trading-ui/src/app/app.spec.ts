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
        { provide: Session, useValue: { isSignedIn, signOut } },
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

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="sign-out"]')!
      .click();
    await fixture.whenStable();

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledWith('/login');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="sign-out"]'),
    ).toBeNull();
  });
});
