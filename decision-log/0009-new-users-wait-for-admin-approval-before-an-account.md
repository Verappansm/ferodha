# 0009 Registration creates the user, but the trading account waits for an admin to approve it

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-07 |
| Decided by | the team |

## Context

The contract had a customer register *with an existing `accountId`*. The first
build did exactly that, which let anyone who knew or guessed an account number
attach themselves to it: account takeover (contract-breach B08).

## Options considered

| Option | For | Against |
|---|---|---|
| As contracted: register against an `accountId` | Matches the contract; instant access | Account takeover by ID guessing |
| Register against an `accountId` plus a one-time code sent out of band | Instant once verified | Needs a channel to send the code that the project doesn't have |
| **Create the user with a PENDING `account_requests` row; refuse login until an admin approves** | Takeover is impossible; a human checks every new customer | Every new user waits on an admin; the demo can only use seeded users |

## Decision

Registration creates a `Users` row and a PENDING `account_requests` row. Login
is refused until an admin approves the request in the console, which creates
the account and links it to the user.

## Consequences

- Takeover by account ID is closed.
- Onboarding needs an admin. That is why the README says only seeded users can
  sign in out of the box.
- Combined with email verification (OTP), registration is now two steps. The
  OTP attempt-cap bypass found in the OWASP review (O-4) matters less here,
  because approval still stands between a verified email and a trading
  account.
