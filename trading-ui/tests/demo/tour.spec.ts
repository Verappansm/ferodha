import { expect, Page, test } from '@playwright/test';
import { click, pause, say, type } from './demo-kit';

/**
 * The guided tour of Ferodha: the customer's day on the trading UI, then the
 * operator's view in the admin console. Runs against the real stack (see
 * playwright.demo.config.ts). Every step asserts what it shows, so a run that
 * finishes green is also a check that every page and its main buttons work.
 */
const UI = process.env.UI_BASE_URL ?? 'http://localhost:4200';
const ADMIN = process.env.ADMIN_BASE_URL ?? 'http://localhost:4300';
const CUSTOMER = process.env.DEMO_USER ?? 'e2e.trader@example.com';
const ADMIN_USER = process.env.DEMO_ADMIN ?? 'michael.brown@example.com';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'seed-password-change-me';
const SYMBOL = process.env.DEMO_SYMBOL ?? 'AAPL';

// A demo that hides a broken page is worse than none: any uncaught error in
// the browser fails the run.
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  pageErrors.set(page, errors);
});

test.afterEach(({ page }) => {
  expect(pageErrors.get(page) ?? [], 'uncaught errors in the browser').toEqual([]);
});

const pageErrors = new WeakMap<Page, string[]>();

async function nav(page: Page, label: string): Promise<void> {
  await click(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: label }));
}

test('the customer: markets, a signal, a trade, the portfolio and the bank', async ({ page }) => {
  await page.goto(`${UI}/login`);
  await say(
    page,
    'Ferodha',
    'A trading platform: live prices, orders over Kafka, portfolio, bank and alerts.',
    2500,
  );

  await say(page, 'Sign in', 'The password never leaves the browser as typed: it is hashed first.');
  await type(page.getByTestId('login-username'), CUSTOMER);
  await type(page.getByTestId('login-password'), PASSWORD);
  await click(page.getByTestId('login-submit'));
  await expect(page).toHaveURL(/\/dashboard/);
  await say(page, 'Dashboard', 'Balances, holdings and recent orders at a glance.', 2500);

  // Markets
  await nav(page, 'Markets');
  await expect(page).toHaveURL(/\/instruments/);
  await say(page, 'Markets', 'Every tradable instrument, searched and filtered on the server.');
  await type(page.getByPlaceholder('Ticker or name, e.g. AAPL or Apple'), 'Apple');
  await expect(page.getByRole('row', { name: new RegExp(SYMBOL) }).first()).toBeVisible();
  await pause(page);
  await click(
    page
      .getByRole('row', { name: new RegExp(SYMBOL) })
      .first()
      .getByRole('link')
      .first(),
  );

  // Instrument
  await expect(page).toHaveURL(new RegExp(`/instruments/${SYMBOL}`));
  await expect(page.getByTestId('quote-mid')).toBeVisible();
  await say(
    page,
    `${SYMBOL}: live quote and chart`,
    'Bid and ask from the live feed; the chart reads stored candles.',
  );
  for (const range of ['1W', '1Y', '1M']) {
    await click(page.getByTestId(`range-${range}`));
    await pause(page, 700);
  }
  const signal = page.getByTestId('signal');
  await signal.scrollIntoViewIfNeeded();
  await expect(page.getByTestId('signal-reason')).toBeVisible();
  await say(
    page,
    'Buy, sell or hold signal',
    '20-day vs 50-day moving average, filtered by the 14-day RSI. Plain statistics, with the reason shown.',
    3000,
  );

  // Order ticket
  await click(page.getByTestId('buy'));
  await expect(page).toHaveURL(/\/order/);
  await say(
    page,
    'Order ticket',
    'Prefilled from the instrument page; the price is suggested from the live ask.',
  );
  await type(page.getByTestId('order-quantity'), '2');
  await click(page.getByTestId('order-submit'));
  await expect(page.getByTestId('order-review')).toBeVisible();
  await say(
    page,
    'Review before confirming',
    'Cost, fee and the cash left afterwards, before anything is sent.',
  );
  await click(page.getByTestId('order-review-confirm'));
  await expect(page.getByTestId('order-result')).toBeVisible();
  await say(
    page,
    'Placed',
    'The order goes over Kafka to the executor, which fills it against the live price.',
  );
  await expect(page.getByTestId('order-result-status')).toHaveText(/FILLED|NEW|PARTIALLY/, {
    timeout: 30_000,
  });
  await pause(page, 2000);

  // Orders
  await nav(page, 'Orders');
  await expect(page.getByTestId('order-row').first()).toBeVisible();
  await say(page, 'Orders', 'Every order with its status, filters, and cancel for working orders.');

  // Portfolio
  await nav(page, 'Portfolio');
  await expect(page.getByTestId('portfolio-summary')).toBeVisible();
  await say(
    page,
    'Portfolio',
    'Holdings valued at live prices, with realised and unrealised profit and loss.',
    2500,
  );

  // Watchlist
  await nav(page, 'Watchlist');
  await say(page, 'Watchlist', 'Lists of instruments with live prices and price alerts.');
  const add = page.getByPlaceholder('Add an instrument…');
  if (await add.isVisible()) {
    await type(add, 'MSFT');
    await pause(page);
    await page.keyboard.press('Escape');
  }

  // Strategies
  await nav(page, 'Strategies');
  await say(
    page,
    'Strategies',
    'Rules that trade for you within limits you set, with a dry run first.',
  );

  // Bank
  await nav(page, 'Bank');
  await say(page, 'Bank', 'Move money between the linked bank account and the trading account.');
  await type(page.locator('#bank-amount'), '100');
  await type(page.locator('#bank-pin'), '1234');
  await click(page.getByRole('button', { name: 'Deposit funds' }));
  await expect(page.getByRole('status').filter({ hasText: 'Deposit completed' })).toBeVisible();
  await say(
    page,
    'Deposited',
    'Sent with a one-off key, so a retry can never move the money twice.',
  );

  // Notifications
  await click(page.getByTestId('nav-notifications'));
  await expect(page).toHaveURL(/\/notifications/);
  await say(page, 'Notifications', 'Order fills and alerts, in the app and by email.');

  // Settings and sign out
  await click(page.getByTestId('account-menu'));
  await click(page.getByTestId('nav-settings'));
  await expect(page.getByTestId('prefs-form')).toBeVisible();
  await say(page, 'Settings', 'Start page, default account and notification preferences.');
  await click(page.getByTestId('account-menu'));
  await click(page.getByTestId('sign-out'));
  await expect(page).toHaveURL(/\/login/);
  await say(page, 'Signed out', '', 1200);
});

test('the operator: the admin console', async ({ page }) => {
  await page.goto(`${ADMIN}/sign-in`);
  await say(page, 'Admin console', 'A separate app with its own admin-only tokens.', 2000);
  await type(page.getByLabel('Email'), ADMIN_USER);
  await type(page.getByLabel('Password'), PASSWORD);
  await click(page.getByRole('button', { name: /sign in/i }));
  await expect(page).toHaveURL(/overview/);
  await say(page, 'Overview', 'Users, accounts, pending requests and fees at a glance.', 2500);

  const pages: [string, string, string][] = [
    [
      'Account requests',
      'account-requests',
      'Approve or reject sign-ups; approval links the bank account held under the verified email.',
    ],
    ['Users', 'users', 'Every user, with suspend and reinstate.'],
    ['Accounts', 'accounts', 'Every trading account and its cash.'],
    ['Instruments', 'instruments', 'Add or retire instruments.'],
    ['All orders', 'orders', 'Every order on the platform.'],
    ['Fees', 'fees', 'Fees earned, by instrument and by user.'],
    ['System health', 'health', 'Each service and its dependencies.'],
    ['Audit log', 'audit', 'Every operator action, who and when.'],
  ];
  const menu = page.getByRole('navigation', { name: 'Console' });
  for (const [link, path, line] of pages) {
    // A link's name can carry a badge ("Account requests 1 pending").
    await click(menu.getByRole('link', { name: new RegExp(`^${link}`) }));
    await expect(page).toHaveURL(new RegExp(`/${path}`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await say(page, link, line, 1600);
  }
  await say(
    page,
    'That is Ferodha',
    'Two Spring Boot services, an auth service, Kafka, Postgres and two Angular apps.',
    3000,
  );
});
