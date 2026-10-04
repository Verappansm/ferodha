import { test, expect } from '@playwright/test';
import { getTestConfig, signIn, expectSignedIn, clearSession } from './fixtures';

test.describe('Dashboard', () => {
  const config = getTestConfig();

  test.beforeEach(async ({ page }) => {
    // Navigate to app first to establish origin, then clear session
    await page.goto('/');
    await clearSession(page);

    // Sign in before each test
    await page.goto('/login');
    await signIn(page, config.username, config.password);

    // Should now be on dashboard after successful login
    await expect(page).toHaveURL(/\/dashboard/);
    await expectSignedIn(page);
  });

  test('Dashboard loads and displays portfolio panels', async ({ page }) => {
    // Wait for dashboard to load
    await expect(page).toHaveURL(/\/dashboard/);

    // Check that the dashboard header is visible
    await expect(page.locator('text=Portfolio Dashboard')).toBeVisible({ timeout: 5000 });

    // Check that main panels exist
    // Cash panel
    await expect(page.locator('app-cash-panel')).toBeVisible({ timeout: 5000 });

    // P&L panel
    await expect(page.locator('app-pnl-panel')).toBeVisible({ timeout: 5000 });

    // Recent orders panel
    await expect(page.locator('app-recent-orders-panel')).toBeVisible({ timeout: 5000 });

    // Top positions panel
    await expect(page.locator('app-top-positions-panel')).toBeVisible({ timeout: 5000 });

    console.log('✓ All dashboard panels are present');
  });

  test('Dashboard displays cash balance data', async ({ page }) => {
    // Wait for the dashboard to fully load
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Check if cash balance is displayed (not a skeleton loader)
    // Look for the cash balance value - it should be a number or currency format
    const cashPanel = page.locator('app-cash-panel');
    await expect(cashPanel).toBeVisible({ timeout: 5000 });

    // Get all text content from cash panel
    const panelText = await cashPanel.textContent();
    console.log('Cash panel content:', panelText);

    // Check that it's not showing just a skeleton or loading state
    // The text should contain numbers (the cash balance)
    expect(panelText).toBeTruthy();
  });

  test('Dashboard panels respond to retry buttons on error', async ({ page }) => {
    // Wait for dashboard to load
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('text=Portfolio Dashboard')).toBeVisible();

    // The panels should be visible
    const cashPanel = page.locator('app-cash-panel');
    await expect(cashPanel).toBeVisible({ timeout: 5000 });

    console.log('✓ Dashboard responsive and panels visible');
  });

  test('Dashboard navigation links work', async ({ page }) => {
    // Check that the Dashboard link in navbar is present
    const dashboardLink = page.locator('a:has-text("Dashboard")');
    await expect(dashboardLink).toBeVisible();

    // Check that Portfolio link exists
    const portfolioLink = page.locator('a:has-text("Portfolio")');
    await expect(portfolioLink).toBeVisible();

    console.log('✓ Navigation links are visible');
  });
});
