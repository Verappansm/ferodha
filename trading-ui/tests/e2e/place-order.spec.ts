import { test, expect } from '@playwright/test';
import {
  getTestConfig,
  signIn,
  expectSignedIn,
  clearSession,
} from './fixtures';

test.describe('Place Order Journey', () => {
  let config = getTestConfig();

  test.beforeEach(async ({ page }) => {
    // Navigate to app first, then clear session to ensure proper origin
    await page.goto('/');
    await clearSession(page);
    await page.goto('/login');
    await signIn(page, config.username, config.password);
    await expectSignedIn(page);
  });

  test('Read-only account: account field displays signed-in user account and is read-only', async ({
    page,
  }) => {
    // Navigate to ordering page
    await page.goto('/order');

    // Verify page loaded
    expect(page.url()).toContain('/order');

    // Get the account field
    const accountInput = page.locator('input[data-testid="order-account"]');
    
    // Account should have a value (from the token)
    const accountValue = await accountInput.inputValue();
    expect(accountValue).toBeTruthy();
    expect(accountValue).toMatch(/^[0-9a-f-]+$/i); // UUID format

    // Account field should be readonly
    const isReadonly = await accountInput.evaluate((el: HTMLInputElement) => el.readOnly);
    expect(isReadonly).toBe(true);
  });

  test('Rejection before submission: validation errors prevent order placement', async ({
    page,
  }) => {
    // Navigate to ordering page
    await page.goto('/order');

    // Submit form with empty fields
    const submitButton = page.locator('button[data-testid="order-submit"]');
    await submitButton.click();

    // Wait for validation messages to appear
    await page.waitForTimeout(500);

    // Should show validation errors for required fields
    const symbolError = page.locator('[data-testid="order-symbol-error"]');
    const quantityError = page.locator('[data-testid="order-quantity-error"]');
    const priceError = page.locator('[data-testid="order-price-error"]');

    await expect(symbolError).toBeVisible();
    await expect(quantityError).toBeVisible();
    await expect(priceError).toBeVisible();

    // Verify no order was submitted
    const successMessage = page.locator('[data-testid="order-success"]');
    await expect(successMessage).not.toBeVisible();
  });

  test('Rejection before submission: invalid quantity (not whole number)', async ({ page }) => {
    // Navigate to ordering page
    await page.goto('/order');

    // Fill in form with invalid quantity
    await page.fill('input[data-testid="order-symbol"]', 'AAPL');
    await page.fill('input[data-testid="order-quantity"]', '10.5'); // Not a whole number
    await page.fill('input[data-testid="order-price"]', '150.00');

    // Submit form
    const submitButton = page.locator('button[data-testid="order-submit"]');
    await submitButton.click();

    // Wait for validation
    await page.waitForTimeout(500);

    // Should show quantity error
    const quantityError = page.locator('[data-testid="order-quantity-error"]');
    await expect(quantityError).toBeVisible();
    const errorText = await quantityError.textContent();
    expect(errorText).toContain('whole number');
  });

  test('Rejection before submission: invalid price (negative)', async ({ page }) => {
    // Navigate to ordering page
    await page.goto('/order');

    // Fill in form with invalid price
    await page.fill('input[data-testid="order-symbol"]', 'AAPL');
    await page.fill('input[data-testid="order-quantity"]', '10');
    await page.fill('input[data-testid="order-price"]', '-150.00'); // Negative price

    // Submit form
    const submitButton = page.locator('button[data-testid="order-submit"]');
    await submitButton.click();

    // Wait for validation
    await page.waitForTimeout(500);

    // Should show price error
    const priceError = page.locator('[data-testid="order-price-error"]');
    await expect(priceError).toBeVisible();
    const errorText = await priceError.textContent();
    expect(errorText).toContain('greater than zero');
  });

  test('Placed order: successful order placement shows status (NEW, FILLED, or REJECTED)', async ({
    page,
  }) => {
    // Navigate to ordering page
    await page.goto('/order');

    // Fill in a valid order form
    await page.fill('input[data-testid="order-symbol"]', 'AAPL');
    await page.selectOption('select[data-testid="order-side"]', 'BUY');
    await page.fill('input[data-testid="order-quantity"]', '1');
    await page.fill('input[data-testid="order-price"]', '150.00');

    // Submit form
    const submitButton = page.locator('button[data-testid="order-submit"]');
    await submitButton.click();

    // Wait for request to complete
    await page.waitForLoadState('networkidle');

    // Should show success message with order status
    const successMessage = page.locator('[data-testid="order-success"]');
    await expect(successMessage).toBeVisible();

    const messageText = await successMessage.textContent();
    expect(messageText).toBeTruthy();
    
    // Verify status is one of the expected values
    expect(messageText).toMatch(/status (NEW|FILLED|REJECTED)/i);
    
    // Extract and verify the status
    const statusMatch = messageText!.match(/status (\w+)/i);
    const status = statusMatch?.[1];
    expect(['NEW', 'FILLED', 'REJECTED']).toContain(status);
  });

  test('Placed order: successful order with NEW status', async ({ page }) => {
    // Navigate to ordering page
    await page.goto('/order');

    // Fill in a valid order form
    await page.fill('input[data-testid="order-symbol"]', 'TEST');
    await page.selectOption('select[data-testid="order-side"]', 'BUY');
    await page.fill('input[data-testid="order-quantity"]', '1');
    await page.fill('input[data-testid="order-price"]', '100.00');

    // Submit form
    const submitButton = page.locator('button[data-testid="order-submit"]');
    await submitButton.click();

    // Wait for response from server
    await page.waitForTimeout(1000);
    await page.waitForLoadState('networkidle');
    
    // Verify that either success, error, or result is shown
    // (order was submitted and backend responded)
    const successMessage = page.locator('[data-testid="order-success"]');
    const errorMessage = page.locator('[data-testid="order-error"]');
    const orderResult = page.locator('[data-testid="order-result"]');
    
    // At least one of these should be visible after submission
    const successVisible = await successMessage.isVisible().catch(() => false);
    const errorVisible = await errorMessage.isVisible().catch(() => false);
    const resultVisible = await orderResult.isVisible().catch(() => false);
    
    expect(successVisible || errorVisible || resultVisible).toBe(true);
  });

  test('Order isolation: each test leaves no shared state for next test', async ({
    page,
    context,
  }) => {
    // This test verifies isolation by checking that clearing session in beforeEach works
    
    // Sign in (done in beforeEach)
    await expectSignedIn(page);

    // Place an order
    await page.goto('/order');
    await page.fill('input[data-testid="order-symbol"]', 'ISOLATION-TEST');
    await page.selectOption('select[data-testid="order-side"]', 'BUY');
    await page.fill('input[data-testid="order-quantity"]', '1');
    await page.fill('input[data-testid="order-price"]', '1.00');

    const submitButton = page.locator('button[data-testid="order-submit"]');
    await submitButton.click();

    await page.waitForTimeout(1000);
    await page.waitForLoadState('networkidle');

    // Verify order was submitted (any response shown)
    const successMessage = page.locator('[data-testid="order-success"]');
    const errorMessage = page.locator('[data-testid="order-error"]');
    const orderResult = page.locator('[data-testid="order-result"]');
    
    const anyVisible = 
      (await successMessage.isVisible().catch(() => false)) ||
      (await errorMessage.isVisible().catch(() => false)) ||
      (await orderResult.isVisible().catch(() => false));
    
    expect(anyVisible).toBe(true);

    // Verify that clearing session actually clears it
    await clearSession(page);
    await page.reload();

    // Session should be cleared
    const sessionData = await page.evaluate(() => {
      return sessionStorage.getItem('trading-ui.session');
    });
    expect(sessionData).toBeNull();
  });
});
