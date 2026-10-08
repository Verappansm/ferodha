# 0005 Services talk over Kafka, and trade_api verifies tokens locally instead of calling auth_service

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-07 |
| Decided by | the team |

## Context

Five services run as separate processes: trade_api, trade_executor,
auth_service, pricing_generator and trades_generator. Every customer request
to trade_api needs a verified identity. Every order has to reach the
executor, and every fill has to come back. If the services called each other
synchronously, whichever one was down would take the request with it.

## Options considered

| Option | For | Against |
|---|---|---|
| REST between services (trade_api → executor; trade_api → auth `/auth/me` per request) | Simple to trace; one style everywhere | auth_service down = every trade request down; one extra round-trip on every call; executor back-pressure becomes customer-facing latency |
| **Kafka for order flow and prices; local JWT verification for identity** | Orders survive an executor restart; auth_service is off the request path; consumers scale independently | Eventual consistency (an order is `NEW` until a fill arrives); a shared HS256 secret; Kafka becomes a trust boundary |
| Asymmetric keys (RS256 with a public key or JWKS) for identity | trade_api can verify tokens but cannot mint them | More moving parts than a capstone needs; kept as the production path |

## Decision

The order flow runs over Kafka:

- trade_api publishes `orders`.
- trade_executor consumes `orders` and publishes `trade-events`.
- pricing_generator publishes `market-data`.

auth_service signs HS256 tokens, and trade_api verifies them itself with the
shared `JWT_SECRET`. trade_api accepts only `iss=auth-service`
(contract-breach B09). There is no HTTP call from trade_api to auth_service.

Inside trade_api, modules call each other in process. The one exception is
strategy orders: `HttpOrderPlacer` deliberately POSTs to trade_api's own
`/api/v1/orders`, so that a strategy order passes the same filter, validation
and idempotency checks as a customer's order (see 0001).

## Consequences

- An outage of auth_service stops new logins only. Tokens already issued keep
  working for their 15 minutes.
- Any service that holds the secret could mint any token. ADR 0001 records this
  limit, and the OWASP review lists it as an accepted risk (A04).
- **Kafka is now a trust boundary.** The executor trusts the payload of an
  `orders` message, so anyone who can produce to that topic controls the
  settlement inputs. That risk is open as O-2/O-5 in `OWASP-SECURITY-REVIEW.md`.
- Internal REST routes can't be protected by `JwtAuthFilter` (it only knows
  customer and admin tokens), so the team keeps internal calls in process. The
  leftover `/notifications/internal/*` routes are the exception and are slated
  for removal (O-1).
