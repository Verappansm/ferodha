import { test as base, Page, expect } from '@playwright/test';

/**
 * Read credentials and URLs from environment variables.
 * Ensures every test is isolated and uses unique, fresh credentials.
 */
export function getTestConfig() {
  const username = process.env.TEST_USERNAME;
  const password = process.env.TEST_PASSWORD;
  const uiBaseUrl = process.env.UI_BASE_URL || 'http://localhost:4200';
  const authApiUrl = process.env.AUTH_API_URL || 'http://localhost:3000';
  const tradeApiUrl = process.env.TRADE_API_URL || 'http://localhost:8080';

  if (!username || !password) {
    throw new Error('TEST_USERNAME and TEST_PASSWORD environment variables must be set');
  }

  return { username, password, uiBaseUrl, authApiUrl, tradeApiUrl };
}

/**
 * Helper to perform a sign-in from the login page.
 * Stays on the current page when it is already the login page, so a
 * `returnUrl` the guard put there survives; otherwise opens /login.
 * Returns once the app has either left /login or shown its error.
 * @param page The Playwright Page object
 * @param username Email address
 * @param password Password
 */
export async function signIn(page: Page, username: string, password: string) {
  if (new URL(page.url()).pathname !== '/login') {
    await page.goto('/login');
  }

  // Fill in credentials using data-testid selectors to match the login component
  await page.fill('[data-testid="login-username"]', username);
  await page.fill('[data-testid="login-password"]', password);

  // Submit the form
  await page.click('[data-testid="login-submit"]');

  // Wait for the outcome: navigation away from /login, or the error message.
  await Promise.race([
    page.waitForURL((url) => url.pathname !== '/login'),
    page.locator('[data-testid="login-error"]').waitFor(),
  ]);
}

/** The account id the signed-in session holds, read from sessionStorage. */
export async function sessionAccountId(page: Page): Promise<string> {
  const raw = await page.evaluate(() => sessionStorage.getItem('trading-ui.session'));
  expect(raw).toBeTruthy();
  return String(JSON.parse(raw!).user.accountId);
}

/**
 * Helper to verify the user is signed in by checking the session state.
 * @param page The Playwright Page object
 */
export async function expectSignedIn(page: Page) {
  // Check that we're on a protected route (not login page)
  expect(page.url()).not.toContain('/login');

  // Verify sessionStorage has a session
  const sessionData = await page.evaluate(() => {
    return sessionStorage.getItem('trading-ui.session');
  });

  expect(sessionData).toBeTruthy();

  // Verify it's valid JSON with accessToken
  const session = JSON.parse(sessionData!);
  expect(session.accessToken).toBeTruthy();
}

/**
 * Helper to verify the user is signed out.
 * @param page The Playwright Page object
 */
export async function expectSignedOut(page: Page) {
  // Verify sessionStorage has no session
  const sessionData = await page.evaluate(() => {
    return sessionStorage.getItem('trading-ui.session');
  });

  expect(sessionData).toBeNull();
}

/**
 * Helper to verify an error message is displayed on the login form.
 * @param page The Playwright Page object
 * @param expectedError The error text to expect
 */
export async function expectLoginError(page: Page, expectedError: string) {
  const errorElement = await page.locator('[class*="error"]').first();
  await expect(errorElement).toContainText(expectedError);
}

/**
 * Helper to clear session storage to ensure test isolation.
 * Only clears if the page has accessed the app origin.
 * @param page The Playwright Page object
 */
export async function clearSession(page: Page) {
  try {
    await page.evaluate(() => {
      try {
        sessionStorage.clear();
      } catch (e) {
        // sessionStorage may not be accessible on blank pages or cross-origin frames
      }
    });
  } catch (e) {
    // Page may not be loaded or accessible yet, skip clearing
  }
}
