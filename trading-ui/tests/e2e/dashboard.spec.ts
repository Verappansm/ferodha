import { test, expect } from '@playwright/test';
import { getTestConfig, signIn, expectSignedIn, clearSession } from './fixtures';

// LEAP-014 against the live stack: after sign-in the dashboard shows the four
// panels, each settled on its figures or its own message, never a blank page.
test.describe('Dashboard', () => {
  const config = getTestConfig();

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearSession(page);
    await page.goto('/login');
    await signIn(page, config.username, config.password);
    await expect(page).toHaveURL(/\/dashboard/);
    await expectSignedIn(page);
  });

  test('shows cash, P&L, recent orders and top positions', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Cash comes from the balance route, which needs no pricing.
    await expect(page.getByTestId('cash-amount')).toHaveText(/\d[\d,]*\.\d{2}\s*[A-Z]{3}/);

    // P&L and positions depend on prices: each must settle on figures, an
    // empty state or a readable message, and never stay on its skeleton.
    await expect(page.getByTestId('pnl-total').or(page.getByTestId('pnl-error'))).toBeVisible();
    await expect(
      page
        .getByTestId('orders-panel-row')
        .first()
        .or(page.getByTestId('orders-panel-empty'))
        .or(page.getByTestId('orders-panel-error')),
    ).toBeVisible();
    await expect(
      page
        .getByTestId('positions-panel-row')
        .first()
        .or(page.getByTestId('positions-panel-empty'))
        .or(page.getByTestId('positions-panel-error')),
    ).toBeVisible();
  });

  test('links each panel to its full page', async ({ page }) => {
    await page.getByTestId('orders-panel').getByRole('link', { name: 'All orders' }).click();
    await expect(page).toHaveURL(/\/orders$/);

    await page.goBack();
    await page.getByTestId('positions-panel').getByRole('link', { name: 'Portfolio' }).click();
    await expect(page).toHaveURL(/\/portfolio$/);
  });
});
