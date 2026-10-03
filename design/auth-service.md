# Auth service (Sprint 8)

NestJS service that registers users, logs them in, rotates refresh tokens and
answers `GET /auth/me`. It is the only component that sees a password. Every
other service checks the access token's HS256 signature with the shared
`JWT_SECRET`, without calling this one.

Contract: `contracts/auth-api.yaml` in the Neueda repository. Where we depart
from it, and why, is in `story_docs/contract-breach.md`.

## Running it

```bash
npm ci
npm run build
npm test            # unit tests, no database needed
npm run start:dev   # needs Postgres with the Sprint 3 schema
```

Configuration comes from the environment. Locally it is read from the
repository-root `.env` (template: the root `.env.example`); an
`auth_service/.env` overrides it if you keep one. Required: `JWT_SECRET` (32+
characters, the same value trade_api verifies with), `POSTGRES_HOST`,
`POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`. Optional:
`PORT` (default 3000).

In `docker compose` the service is `auth-service`, on port 3000 inside the
network and on the host. On the Windows setup it runs natively on 3000.

`npm run test:e2e` runs `auth_service/test/app.e2e-spec.ts` against a real database.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | Creates the user only. No token, no trading account. 201, 409 `AUTH-409`, 422 `VAL-422` |
| POST | `/auth/login` | 200 with an access and refresh token, or 401 `AUTH-401` for every failure |
| POST | `/auth/refresh` | 200 with a new pair; the presented token is spent |
| GET | `/auth/me` | Bearer token required. The user named by the token |
| GET | `/health` | Container health check, not part of the contract |

## OpenAPI

The running service publishes its own OpenAPI document, generated from the
controller and DTO decorators (`auth_service/src/openapi.ts`):

- Human page: `http://localhost:3000/docs`
- JSON document: `http://localhost:3000/docs/json`

## Registration and accounts

A user is registered first, and a trading account is opened for them
afterwards (`Accounts.user_id` points at the user). Until they own an account
they cannot log in: the access token must carry a real `accountId`, and there
is none to give. Nothing in the platform opens an account through an API yet,
so for now accounts come from the seed data or SQL.

Usernames are email addresses, trimmed and lower-cased on the way in. For
development, the seeded account holders (for example
`john.carter@example.com`, account 1) all have the password
`seed-password-change-me`.

Only users whose `Users.status` is `ACTIVE` can log in, refresh or call
`/auth/me`. A suspended or closed user's refresh chain is revoked at their
next refresh.

## Login throttle

- **Attempts:** 5 failed logins per client IP.
- **Cooldown:** 15 minutes, counted from that IP's first failure.

After the fifth failure, every login from that IP gets the usual
`401 AUTH-401` plus a `Retry-After` header until the window ends.

- **What counts:** only failed logins. A successful login neither counts nor
  resets the window. A server error doesn't count either.
- **Which address:** the IP is Express's `request.ip`, meaning the connecting
  socket. Behind a reverse proxy that would be the proxy's address, so
  `trust proxy` would need setting first.
- **Where counts live:** in this process's memory. A restart clears them, and
  each instance counts on its own.

The throttle limits how fast someone can guess. It does not hide whether an
email is registered; the identical response and the decoy bcrypt comparison
do that.

## Tokens

Access tokens are HS256, live 15 minutes, and carry exactly `sub`,
`accountId`, `roles`, `iat`, `exp` and `iss` (`auth-service`).

Refresh tokens are opaque, live 7 days, are stored only as a SHA-256 hash in
`auth_refresh_tokens`, and can be used once. Each login starts a chain.
Presenting a spent token revokes that chain, not the user's other logins
(`story_docs/extension-stories.md`, LEAP-005).

## Documents

- Security review: `auth_service/security-review/sprint8-review.md`.
- Password hashing, cost factor and logging: `design/auth-password-hashing.md`.
- Manual end-to-end checks: the Bruno collection in `bruno/` (`bruno/bruno-collection.md`).
