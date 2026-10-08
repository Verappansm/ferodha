# 0001 Strategies place orders under a short-lived delegated token, not a borrowed one

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-07 |
| Decided by | the team |

## Context

An automated strategy fires when nobody is signed in, so it has no customer
access token to present. Orders must still go through `POST /api/v1/orders`
(its validation, authorisation and idempotency check are what stand between a
strategy bug and an unrecoverable position), so the order route needs to see a
caller it can authorise. Tokens here are HS256 under one shared secret
(`JWT_SECRET`); a customer access token lives 15 minutes and refresh tokens 7
days.

## Options considered

| Option | For | Against |
|---|---|---|
| Store the customer's refresh token (or password) and sign in as them | No new token type | A stored credential is a breach waiting to happen; it outlives logout, a forced reset and a suspension; it carries every right the customer has |
| One service account allowed to trade any account | Simple | One compromised service trades every customer's money; no per-customer audit trail |
| **A delegated token per order, scoped to one strategy** | Narrow, short-lived, revocable at once, audited | A new token shape to verify; see the limit below |

## Decision

Each order a strategy places carries a 60 second token minted for that order:
`sub` is the customer, `accountId` the one account, `strategyId` the acting
strategy, `act.sub = "strategy-service"` the actor (the actor claim of RFC 8693
token exchange). `JwtAuthFilter` then enforces three things on every request:

1. the token's user is still ACTIVE with no forced reset (the same per-request
   check every customer token gets, so a suspension stops strategies too);
2. a delegated token may reach `POST /api/v1/orders` and nothing else: it
   cannot read a portfolio, cancel an order, or touch a strategy (AUTH-403);
3. its strategy must still be ENABLED, checked against the database, so
   disabling a strategy refuses its very next order whatever the token's
   remaining lifetime (AUTH-401).

No password, refresh token or long-lived credential is stored for a strategy.

## Consequences

- Disabling is immediate even in the middle of an evaluation cycle: the engine
  also claims each order with one guarded `UPDATE ... WHERE status = 'ENABLED'`.
- **Known limit.** Signing uses the shared HS256 secret, so trade_api, which
  mints the token, could mint any token. The scope, the 60 second lifetime and
  the per-request checks above are what hold it to one strategy. A production
  system would give the minting service its own asymmetric key, or move the
  minting into the auth service.
- Orders are tagged with `Orders.strategy_id`, so every strategy order can be
  traced to the rule that placed it.
