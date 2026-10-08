# 0008 Admin tokens are kept apart from customer tokens by audience and shape, not by a separate key

| Field | Value |
|---|---|
| Status | accepted |
| Date | 2026-10-07 |
| Decided by | the team |

## Context

The admin console (port 4300) needs tokens that reach `/admin/**` in
auth_service and `/api/v1/admin/**` in trade_api. Customer tokens must never
reach those routes, and admin tokens must never be able to trade as a
customer.

## Options considered

| Option | For | Against |
|---|---|---|
| A separate signing key (or issuer) for admin tokens | A leaked customer-side secret can't forge admin tokens | A second secret to provision, rotate and pass to two services |
| An external identity provider for staff | The proper long-term answer | Out of reach for the sprint |
| **Same HS256 key; admin tokens carry `aud: admin-console` and `roles:[ADMIN]`, have no `accountId`, and get no refresh token** | One secret; each token type is refused on the other's routes; a short 15-minute admin session | One leaked secret forges both kinds |

## Decision

`AdminJwtGuard` (auth_service) and `JwtService.verifyAdmin` (trade_api)
require `aud=admin-console` and the ADMIN role. Customer routes accept a token
only if it has an integer `accountId`, which admin tokens never carry. Admin
sessions are not refreshed (contract-breach B18).

## Consequences

- Each token type is refused on the other's routes. The OWASP review confirmed
  this in both services (R1).
- The secret is the single point of failure. The OWASP review accepts this
  risk (A04) and lists hardening as open: make `JWT_SECRET` required in compose
  (O-3), and pin the issuer and reject `aud` in auth_service's `JwtAuthGuard`
  (O-9).
