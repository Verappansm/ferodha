# trading-ui Playwright E2E Tests

End-to-end tests for the trading-ui Angular application using Playwright. These tests validate the two critical user journeys: **Sign-in** and **Place Order**.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Environment Variables

```bash
export TEST_USERNAME="your-test-email@example.com"
export TEST_PASSWORD="your-test-password"
```

Optional (defaults shown):

```bash
export UI_BASE_URL="http://localhost:4200"
export AUTH_API_URL="http://localhost:3000"
export TRADE_API_URL="http://localhost:8080"
```

### 3. Ensure Stack is Running

The tests require the full stack to be running:

- Auth service on http://localhost:3000
- Trade API on http://localhost:8080
- Postgres on localhost:5432
- Kafka on localhost:9092

Start with: `docker compose up`

### 4. Run Tests

```bash
# Run all tests
npm run e2e

# Run with UI (interactive)
npm run e2e:ui

# Run in debug mode
npm run e2e:debug

# Run specific test file
npx playwright test tests/e2e/sign-in.spec.ts
```

### 5. View Results

```bash
# Open HTML report
npx playwright show-report
```

## Test Suites

### Sign-In Journey (6 tests)

Located in `sign-in.spec.ts`

- Guard redirect: Unauthenticated access redirects to login with returnUrl
- Refused sign-in: Invalid credentials show error, password cleared
- Successful sign-in: Valid credentials sign in and navigate to dashboard
- Arriving where you were going: Return URL preserved after sign-in
- Sign-in preserves destination: Specific returnUrl is honored
- Sign-out clears session: Session removed from sessionStorage

### Place Order Journey (7 tests)

Located in `place-order.spec.ts`

- Read-only account: Account field displays user account and is read-only
- Rejection before submission (empty form): Validation prevents submission
- Rejection before submission (invalid quantity): Quantity must be whole number
- Rejection before submission (invalid price): Price must be positive
- Placed order with status: Successful placement shows NEW/FILLED/REJECTED
- Placed order (explicit NEW): Order placement with any valid status
- Order isolation: Tests leave no shared state for next test

### Platform Journeys (`journeys.spec.ts`, 7 tests, run in order)

The whole life cycle, each run with a brand-new customer:

1. Sign up, enter the emailed code; sign-in is refused until approval.
2. An admin approves the request in the admin console.
3. The customer signs in, deposits 5,000 from the bank (PIN 1234), and a buy fills over Kafka.
4. Selling more than is held is refused, with the reason.
5. A buy below the market rests on the book and is cancelled. **Needs market-sim**
   (`start-windows.ps1 -MarketSim`); on the default profile the order is rejected at
   once, so this step reports itself skipped.
6. An admin adds and delists an instrument; the customer can no longer trade it.
7. An admin suspends the customer; their sign-in is refused.

What they need beyond the other suites:

- **The admin console** on `ADMIN_BASE_URL` (default `http://localhost:4300`).
- **No mail server** (`SMTP_HOST` unset): the sign-up code is read from the auth
  service log. It is found in `windows/.run/logs/auth-service.log` (Windows setup)
  or `docker logs auth-service` (Docker); set `E2E_AUTH_LOG` to the log file otherwise.
- **Database access**, to play the bank: a bank account under the new customer's
  email has to exist before approval (decision 0012). Read from `windows/.env.windows`
  when present, else `E2E_PG_HOST/PORT/DB/USER/PASSWORD`, else the Docker defaults.
- **Fewer than 5 failed sign-ins in 15 minutes from this machine.** The auth service
  locks out an address after that; a full run makes 3. When re-running back to back,
  restart the auth service (the counter lives in memory) or wait 15 minutes.

## File Structure

```
tests/e2e/
├── README.md                 # This file
├── fixtures.ts              # Shared test helpers
├── sign-in.spec.ts          # Sign-in journey tests
└── place-order.spec.ts      # Place order journey tests
```

## Key Features

### Real Stack Testing

- Tests run against actual auth service, trade API, and database
- No mocking of services or API responses
- Full integration testing

### Isolated Tests

- Each test runs in its own process
- Session storage cleared between tests
- No shared state between tests
- Every test is independent

### Environment-Based Configuration

All sensitive data comes from environment variables:

- `TEST_USERNAME`: Email for login
- `TEST_PASSWORD`: Password for login
- All URLs are configurable

### Comprehensive Coverage

**Sign-in Journey**:

- Authentication guard redirects
- Error handling for invalid credentials
- Successful authentication flow
- Return URL preservation
- Session cleanup

**Place Order Journey**:

- Account visibility and read-only protection
- Form validation before submission
- Order placement with status tracking
- Support for NEW, FILLED, REJECTED statuses

## Status Handling

Orders can return three statuses on successful placement:

| Status   | Meaning                             | When                                 |
| -------- | ----------------------------------- | ------------------------------------ |
| NEW      | Order received, awaiting processing | Executor not running or processing   |
| FILLED   | Order matched and executed          | Executor running and market filled   |
| REJECTED | Order rejected                      | Executor running but market rejected |

Tests accept ANY valid status to avoid failures based on executor deployment state.

## Debugging

### Run with Debug UI

```bash
npm run e2e:debug
```

### View Traces

Traces are captured automatically on test failure. View with:

```bash
npx playwright show-trace path/to/trace.zip
```

### Check Session Storage

Use browser devtools or add debug output:

```typescript
const session = await page.evaluate(() => sessionStorage.getItem('trading-ui.session'));
console.log(JSON.parse(session));
```

## Troubleshooting

### Tests failing with "Cannot find element"

- Check that selectors match the component HTML
- Use `npm run e2e:debug` to step through tests
- Review IMPLEMENTATION.md for selector details

### Auth failures

- Verify TEST_USERNAME and TEST_PASSWORD are set correctly
- Check that auth service is running on AUTH_API_URL
- Ensure database has test user created

### Order placement failures

- Verify trade API is running on TRADE_API_URL
- Check that account ID is valid UUID
- Ensure sufficient market data for order processing

### Timeout errors

- Increase `timeout` in playwright.config.ts if network is slow
- Verify all stack components are running
- Check network connectivity to localhost services
