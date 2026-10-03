# Contract breaches

Every place this repository departs from what Neueda gave us: the binding
contracts and sprint READMEs in
[Neueda-Learning/leap-capstone-india](https://github.com/Neueda-Learning/leap-capstone-india),
the architecture pages at [leap-architecture.pages.dev](https://leap-architecture.pages.dev/),
and the sprint stories on the board.

`contracts/README.md` says: "If you believe a contract is wrong, raise it. Do
not quietly build something else." This file is how we raise them. Every row
below is a decision the team has taken and will defend at review.

## Summary

| # | Area | Source | What the source says | What we do |
|---|---|---|---|---|
| B01 | Auth: username | `contracts/auth-api.yaml` RegisterRequest | `username` is 3-64 chars, pattern `^[a-zA-Z0-9._-]+$` (e.g. `priya.menon`) | `username` must be an email address, stored lower-case in `Users.email` |
| B02 | Auth: register body | `auth-api.yaml` RegisterRequest, `additionalProperties: false` | Only `username`, `password`, `accountId`, optional `roles` | Also accepts an optional `name` |
| B03 | Auth: refresh reuse | `auth-api.yaml` `/auth/refresh`; architecture auth page | A consumed token presented again revokes **every** refresh token for that user | Revokes only that login's chain (its family); see LEAP-005 |
| B04 | Auth: login throttle | Architecture auth page | "five attempts a minute per address" | 5 **failed** attempts per IP per **15 minutes**; successful logins are not counted |
| B05 | Auth: data ownership | Architecture auth page, HLD | Auth owns a Users table and a refresh-tokens table, "nothing else", in a separate `auth` schema, and never reads accounts | Uses the platform's Sprint 3 `Users` table, keeps `auth_refresh_tokens` in `public`, reads `Accounts` to find the account a user owns, and files a row in `account_requests` at registration |
| B06 | Auth: error codes | `auth-api.yaml` ErrorResponse enum | `errorCode` is one of `AUTH-401`, `AUTH-409`, `VAL-422` | Also `INTERNAL-500` for an unexpected fault; an unknown path answers **404** with `VAL-422` |
| B07 | Auth: folder | Sprint 8 README | "One NestJS project rooted in this folder" (`sprint-08-auth-service/`) | `auth_service/` |
| B08 | Auth: registration and accounts | `auth-api.yaml` RegisterRequest, UserResponse; Sprint 8 README | Register takes a required `accountId` naming an existing account, and `UserResponse.accountId` is required | The user is registered first and an account is opened for them afterwards. Register takes no `accountId` (sending one is `VAL-422`), its response has none, and it files a PENDING account request. Login is refused until an admin approves the request and the account is opened |
| B09 | Issuer validation | Story 3 vs `auth-api.yaml` | Story 3: "do not require a particular issuer value in any consumer". Contract: "Consumers must validate the configured issuer" | trade_api accepts only tokens whose `iss` is `auth-service` (`app.jwt.issuer`) |
| B10 | Ports (retired) | `infra/README.md`; contract `servers` | Postgres `localhost:5432`, Kafka `localhost:9092`, auth `localhost:3000`, trade API `:8080` | No longer a departure: since 2026-10-03 the Docker host ports are the contract's, the same as the Windows profile |
| B11 | Env names | Neueda root `.env.example` | `FAUXNANCE_BASE_URL`, `POSTGRES_DB=trading` | `FAUXNANCE_API_URL`, `POSTGRES_DB=tradedb` |
| B12 | Container count | Top-level README | Five containers: Postgres, Kafka, Trade REST API, Trade Executor, auth service | Also `kafka-ui`, `pricing-generator` and `trades-generator` |
| B13 | Order status | `contracts/trade-api.yaml` OrderStatus | `NEW, FILLED, REJECTED, CANCELLED`; "There is no partial-fill state" | Adds `PARTIALLY_FILLED`, plus `Orders.source` and `Orders.filled_quantity` (LEAP-003) |
| B14 | Fill quantity | `contracts/kafka-topics.md` ORDER_FILLED | `quantity` equals the ordered quantity, "since partial fills are out of scope" | Under `market-sim`, a fill can carry less than the ordered quantity (LEAP-003) |
| B15 | Fauxnance key holder | Architecture HLD | The Trade Executor is the "only holder of FAUXNANCE_API_KEY" | Under `market-sim`, `pricing_generator` holds it and the executor does not (LEAP-002) |
| B16 | Order-flow scope | `trade-api.yaml` / Sprint 7 README | One order, one quote: fill-or-reject | Under `market-sim`, orders match against a resting book, rest if unmatched, and expire by TTL (LEAP-003/004) |
| B17 | Where the claims live | Sprint 4 README | `claims.md` in the analytics folder | `design/analytics-claims.md`; `analytics_etl/README.md` points to it |
| B18 | Admin tokens | `auth-api.yaml` JWT claims contract | Every token carries an integer `accountId`; `roles` is `CUSTOMER` or `ADMIN` | `POST /auth/admin/login` issues an admin console token: `roles: [ADMIN]`, `aud: admin-console`, no `accountId`, no refresh token. Customer `/auth/login` refuses admin users; trade_api accepts each kind only on its own routes |
| B19 | Admin routes and error codes | `trade-api.yaml`, `auth-api.yaml` | No admin routes; catalogues as listed | `/api/v1/admin/**` in trade_api and `/admin/**` in the auth service (`design/admin-trade-api.yaml`, `design/admin-auth-api.yaml`), adding `AUTH-403`, `ADM-404` and `ADM-409` |

## Why

**B01 (username is an email).** An email is an identity a person already has,
is unique per person, and is what the Sprint 3 schema already keys users on
(`Users.email`, UNIQUE). A made-up username needs its own uniqueness rules and
recovery story, and the schema has no column for one. Someone who needs two
roles registers two users with two emails, since a role belongs to a user row.
Emails are trimmed and lower-cased, so one address is one user whatever case it
is typed in. The cost: a client generated from the contract that sends
`priya.menon` gets `VAL-422`.

**B02 (`name`).** `Users.name` is NOT NULL, and we do not want to address
someone by their email. It is optional, so a body that follows the contract
exactly still registers: without a name, the part of the email before the `@`
is stored.

**B03 (per-chain revocation).** A user on a phone and a laptop has two
independent chains. A replayed token proves that *that* chain was copied, not
that every device was. Revoking only the affected chain cuts off the
compromised session without signing the user out everywhere. The residual risk
is in V2.6 (Token Revocation) of `auth_service/security-review/sprint8-review.md`.

**B04 (throttle).** Counting only failures means a user who logs in often is
never locked out, and not resetting on success means an attacker with one
valid account cannot clear the counter between guesses at another. 15 minutes
slows guessing far more than one minute does. A throttled IP gets the same
`AUTH-401` with a `Retry-After` header, because the contract's error catalogue
has no 429.

**B05 (shared Users table).** Credentials already had a home in the Sprint 3
schema, with roles and statuses other components read. A second users table
would mean two sources of truth for who a person is. Since accounts are opened
for users, the auth service has to read `Accounts` to know which account a
token names. We keep the refresh-token table in `public` next to `Users` to
avoid schema management for a single table.

**B06 (extra error code, 404).** The contract has no code for an internal fault,
yet one can still happen. Answering 500 with `AUTH-401` would lie about the
cause and send the UI to the login page. `INTERNAL-500` keeps the envelope
shape. An unknown path keeps its honest 404 status, with `VAL-422` because the
catalogue has no not-found code for this service.

**B07 (folder name).** Every other module in this repository is named
`snake_case` after its service (`trade_api`, `trade_executor`), not after a
sprint number.

**B08 (user first, account after).** Taking an `accountId` at registration let
anyone attach themselves to any existing account, because a public route cannot
check who owns it; that is how the account-takeover defect in the first Sprint
8 build happened. The Sprint 3 schema already models ownership the other way
round (`Accounts.user_id` points at the user), so the user is created first and
the account is opened for them. No token is minted without a real `accountId`,
so login waits for the account; the claim set is unchanged. Registration files
a PENDING row in `account_requests` (trade_api Liquibase `008`) in the same
transaction as the user; an admin approving it opens the `Accounts` row
(LEAP-011, approval not built yet).

**B09 (issuer).** The two sources disagree, and we follow the contract. The
`iss` claim says which service minted a token. A consumer that checks it will
refuse tokens from any other issuer that happens to share the key: a test
fixture, another team's service during the cutover, or a future identity
provider. It does not change anything when the auth service itself runs as
several instances, since they all sign as `auth-service`; what it buys is that
adding a second, different issuer later is a deliberate configuration change
rather than an accident.

**B10 (host ports, retired).** Docker used to publish every port in an
8090-8097 block, while the Windows profile used the contract's numbers, so
the trading UI, Playwright and the bundle scan could only match one of the
two. Since 2026-10-03 Docker publishes the contract's ports as well, and every
way of running the stack uses one set of numbers (root README, "Ports"). The
cost: a native Postgres on 5432 must be stopped before `docker compose up`.

**B11 (env names).** Team preference. Renaming would mean touching every
service and script in one commit.

**B12 (extra containers).** `kafka-ui` is a development convenience with no role
in the platform. `pricing-generator` (LEAP-002) and `trades-generator` (LEAP-004)
are the market simulation. None of them is on the order path
under the default profile.

**B13-B16 (market simulation).** All four are the `market-sim` profile
(LEAP-002 to LEAP-004), which exists to demonstrate a real order book without
exhausting a 2000-a-day quota. None of it is reachable under the default
profile, and no REST field exposes `source` or `filled_quantity`. The
remaining breach is the `PARTIALLY_FILLED` literal itself, which a client
generated from `trade-api.yaml` cannot deserialise.

**B17 (claims location).** Design write-ups are kept together in `design/`,
and the analytics claims are one of them. `analytics_etl/README.md` says the
sprint asked for them and where they are, and the dashboard text points there
too, so nothing is harder to find.

**B18 (admin tokens).** An operator does not trade, so an honest admin token
has no account to name; giving every admin a fake operations account would put
a trading key on a token that must never trade. The `admin-console` audience
keeps the two kinds apart in both directions: trade_api's customer routes
refuse a token with that audience, and its admin routes refuse one without it.
No refresh token, so an operator's session ends after 15 minutes.

**B19 (admin routes and codes).** The contracts have no administration
surface, and LEAP-011 and LEAP-021 to LEAP-023 need one. Each admin route
lives in the service that owns the data it changes (`Accounts`, `Orders` and
`Instruments` in trade_api; `Users` and refresh tokens in the auth service).
`AUTH-403` separates "not signed in" from "signed in, but not an admin";
`ADM-404` and `ADM-409` cover a missing target and a target whose state does
not allow the action. Both services write their decisions to the one
`admin_audit` table (trade_api Liquibase `009`).
