import { Browser, expect, Page, test } from '@playwright/test';
import { BANK_PIN, openBankAccount, signupCode } from './backoffice';
import { signIn } from './fixtures';

/**
 * The platform's life cycle, end to end against the real stack, in order:
 * sign-up and email code, admin approval, a deposit, a buy that fills, a sell
 * that is rejected, a resting order cancelled, an instrument delisted, and a
 * suspended user refused at sign-in. Each run signs up a new customer (the
 * test plays the bank and opens their bank account first), so it can run
 * again on the same database.
 *
 * Needs: the stack (both UIs, auth, trade-api, executor, Kafka), SMTP_HOST unset
 * so the sign-up code is logged, and database access for the bank row (see
 * backoffice.ts). The cancel step needs the market-sim profile, where orders
 * rest on a book; on the default profile it reports itself skipped.
 */
const ADMIN_URL = process.env['ADMIN_BASE_URL'] ?? 'http://localhost:4300';
const ADMIN_USER = process.env['E2E_ADMIN_USER'] ?? 'michael.brown@example.com';
const ADMIN_PASSWORD = process.env['E2E_ADMIN_PASSWORD'] ?? 'seed-password-change-me';
const SYMBOL = process.env['E2E_SYMBOL'] ?? 'AAPL';

const run = Date.now().toString(36);
const customer = {
  name: `E2E Customer ${run}`,
  email: `e2e.${run}@example.com`,
  password: `Journey-${run}-Pw1!`,
};
const delistTicker = `E2E${run
  .slice(-5)
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, 'X')}`;

test.describe.configure({ mode: 'serial' });

async function adminPage(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${ADMIN_URL}/sign-in`);
  await page.getByLabel('Email').fill(ADMIN_USER);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/overview/);
  return page;
}

// A link's name can carry a badge ("Account requests 1 pending"), so match its start.
async function adminMenu(page: Page, link: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Console' })
    .getByRole('link', { name: new RegExp(`^${link}`) })
    .click();
}

async function giveReason(page: Page, reason: string): Promise<void> {
  await page.getByTestId('reason-input').fill(reason);
  await page.getByTestId('reason-confirm').click();
}

/**
 * Opens the ticket for a symbol and side and reviews it. A price from a link is
 * only a suggestion that the live quote replaces, so a given price is typed,
 * as a customer would; without one the ticket's own suggestion is used.
 */
async function review(
  page: Page,
  symbol: string,
  side: 'BUY' | 'SELL',
  quantity: number,
  price?: number,
) {
  await page.goto(`/order?symbol=${symbol}&side=${side}`);
  await expect(page.getByTestId('order-price')).not.toHaveValue('', { timeout: 15_000 });
  await page.getByTestId('order-quantity').fill(String(quantity));
  if (price !== undefined) await page.getByTestId('order-price').fill(price.toFixed(2));
  await page.getByTestId('order-submit').click();
  await expect(page.getByTestId('order-review')).toBeVisible();
}

test('1. a new customer signs up and confirms their email; sign-in waits for approval', async ({
  page,
}) => {
  await openBankAccount(customer.email);

  await page.goto('/register');
  await page.getByTestId('register-name').fill(customer.name);
  await page.getByTestId('register-email').fill(customer.email);
  await page.getByTestId('register-password').fill(customer.password);
  await page.getByTestId('register-confirm').fill(customer.password);
  await page.getByTestId('register-submit').click();
  await expect(page.getByTestId('register-verify')).toBeVisible();

  await expect.poll(() => signupCode(customer.email), { timeout: 15_000 }).toMatch(/^\d{6}$/);
  await page.getByTestId('register-code').fill(signupCode(customer.email));
  await page.getByTestId('register-verify-submit').click();
  await expect(page.getByTestId('register-success')).toBeVisible();

  await signIn(page, customer.email, customer.password);
  await expect(page.getByTestId('login-error')).toBeVisible();
});

test('2. an admin approves the request; the account opens on their bank account', async ({
  browser,
}) => {
  const admin = await adminPage(browser);
  await adminMenu(admin, 'Account requests');
  const row = admin.getByTestId('request-row').filter({ hasText: customer.email });
  await expect(row).toBeVisible();
  await row.getByTestId('approve').click();
  await admin.getByTestId('approve-confirm').click();
  await expect(admin.getByTestId('requests-notice')).toContainText(`Approved ${customer.name}`);
  await admin.context().close();
});

test('3. the customer signs in, deposits from the bank, and a buy fills over Kafka', async ({
  page,
}) => {
  await signIn(page, customer.email, customer.password);
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto('/bank');
  await page.locator('#bank-amount').fill('5000');
  await page.locator('#bank-pin').fill(BANK_PIN);
  await page.getByRole('button', { name: 'Deposit funds' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Deposit completed' })).toBeVisible();

  await review(page, SYMBOL, 'BUY', 2);
  await page.getByTestId('order-review-confirm').click();
  await expect(page.getByTestId('order-result-status')).toHaveText('FILLED', { timeout: 30_000 });

  await page.goto('/portfolio');
  await expect(page.getByTestId('portfolio-row').filter({ hasText: SYMBOL })).toBeVisible();
});

test('4. selling more than is held is refused, with the reason', async ({ page }) => {
  await signIn(page, customer.email, customer.password);
  await review(page, SYMBOL, 'SELL', 50);
  // trade-api checks holdings when the order is placed, so the refusal comes
  // back at once, before anything goes to Kafka.
  await page.getByTestId('order-review-confirm').click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /do not hold enough/i })
      .first(),
  ).toBeVisible();
  await expect(page.getByTestId('order-result')).toHaveCount(0);
});

test('5. a buy below the market rests on the book and is cancelled (market-sim)', async ({
  page,
}) => {
  await signIn(page, customer.email, customer.password);
  await review(page, SYMBOL, 'BUY', 1, 1.0);
  await page.getByTestId('order-review-confirm').click();
  // The ticket shows NEW, then the executor's outcome. On the default profile
  // an unmarketable order turns REJECTED within moments; on market-sim it
  // stays NEW, resting on the book.
  const status = page.getByTestId('order-result-status');
  await expect(status).toHaveText(/NEW|REJECTED/, { timeout: 30_000 });
  const rejected = await expect(status)
    .toHaveText('REJECTED', { timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(
    rejected,
    'Default profile: an unmarketable order is rejected at once. Run with -MarketSim to test cancel.',
  );

  const orderId = (await page.getByTestId('order-result-id').textContent())!.trim();
  await page.goto('/orders');
  const row = page
    .getByTestId('order-row')
    .filter({ hasText: orderId.slice(0, 12) })
    .first();
  await row.getByTestId('cancel-order').click();
  await page.getByTestId('cancel-yes').click();
  await expect(page.getByTestId('cancel-outcome')).toBeVisible();
  await expect(
    page
      .getByTestId('order-row')
      .filter({ hasText: orderId.slice(0, 12) })
      .first(),
  ).toContainText(/cancel/i, { timeout: 30_000 });
});

test('6. an admin delists an instrument; customers can no longer trade it', async ({
  browser,
  page,
}) => {
  const admin = await adminPage(browser);
  await adminMenu(admin, 'Instruments');
  await admin.getByTestId('instrument-add').click();
  await admin.getByTestId('add-ticker').fill(delistTicker);
  await admin.getByTestId('add-name').fill(`E2E Delist ${run}`);
  await admin.getByTestId('add-exchange').fill('E2E');
  await admin.getByTestId('add-reason').fill('End-to-end test instrument');
  await admin.getByTestId('add-save').click();

  await admin.locator('#exchange').fill('E2E');
  await admin.locator('#exchange').press('Enter');
  const row = admin.getByTestId('instrument-row').filter({ hasText: delistTicker });
  await expect(row).toContainText('TRADABLE');
  await row.getByRole('button', { name: 'Delist' }).click();
  await giveReason(admin, 'End-to-end test: delisting');
  await expect(row).toContainText('DELISTED');
  await admin.context().close();

  await signIn(page, customer.email, customer.password);
  await page.goto(`/order?symbol=${delistTicker}&side=BUY&price=10`);
  await page.getByTestId('order-quantity').fill('1');
  await page.getByTestId('order-submit').click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /not available to trade/i })
      .first(),
  ).toBeVisible();
  await expect(page.getByTestId('order-review-confirm')).toBeDisabled();
});

test('7. an admin suspends the customer; their sign-in is then refused', async ({
  browser,
  page,
}) => {
  const admin = await adminPage(browser);
  await adminMenu(admin, 'Users');
  await admin.locator('#q').fill(customer.email);
  await admin.locator('#q').press('Enter');
  const row = admin.getByTestId('user-row').filter({ hasText: customer.email });
  await row.getByTestId('suspend-user').click();
  await giveReason(admin, 'End-to-end test: suspension');
  await expect(admin.getByTestId('users-notice')).toBeVisible();
  await expect(row).toContainText(/suspended/i);
  await admin.context().close();

  await signIn(page, customer.email, customer.password);
  await expect(page.getByTestId('login-error')).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
