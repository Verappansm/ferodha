import { test, expect } from '@playwright/test';
import { getTestConfig, signIn, expectSignedIn, expectSignedOut, clearSession } from './fixtures';

test.describe('Sign-in Journey', () => {
  const config = getTestConfig();

  test.beforeEach(async ({ page }) => {
    // Navigate to app first to establish origin, then clear session
    await page.goto('/');
    await clearSession(page);
  });

  test('Guard redirect: unauthenticated user is redirected to login with returnUrl', async ({
    page,
  }) => {
    await page.goto('/orders');

    // toHaveURL waits for the guard's redirect instead of racing it.
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Forders$/);
    await expectSignedOut(page);
  });

  test('Refused sign-in: invalid credentials show error and password is cleared', async ({
    page,
  }) => {
    await page.goto('/login');
    await expectSignedOut(page);

    await signIn(page, config.username, 'invalid-password-12345');

    await expect(page).toHaveURL(/\/login/);
    const errorElement = page.locator('[data-testid="login-error"]');
    await expect(errorElement).toBeVisible();
    await expect(errorElement).toContainText('did not sign you in');
    await expect(page.locator('[data-testid="login-password"]')).toHaveValue('');
    await expectSignedOut(page);
  });

  test('Successful sign-in: valid credentials sign in and navigate to dashboard', async ({
    page,
  }) => {
    await page.goto('/login');

    await signIn(page, config.username, config.password);

    await expect(page).toHaveURL(/\/dashboard$/);
    await expectSignedIn(page);
  });

  test('Arriving where you were going: sign-in lands on the page the guard stopped', async ({
    page,
  }) => {
    // /orders, not /dashboard: the dashboard is where sign-in lands anyway,
    // so only a different page proves the return address was followed.
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Forders$/);

    await signIn(page, config.username, config.password);

    await expect(page).toHaveURL(/\/orders$/);
    await expectSignedIn(page);
  });

  test('Sign-in follows a returnUrl given on the login link', async ({ page }) => {
    await page.goto('/login?returnUrl=%2Forders');

    await signIn(page, config.username, config.password);

    await expect(page).toHaveURL(/\/orders$/);
    await expectSignedIn(page);
  });

  test('Sign-out button clears the session and returns to sign-in', async ({ page }) => {
    await signIn(page, config.username, config.password);
    await expectSignedIn(page);

    await page.click('[data-testid="sign-out"]');

    await expect(page).toHaveURL(/\/login/);
    await expectSignedOut(page);

    // The guard now stops a protected page again.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fdashboard$/);
  });
});
