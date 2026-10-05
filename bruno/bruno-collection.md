# Bruno collection - Sprint 8 auth service

Exercises all four contract endpoints end to end: `POST /auth/register`,
`POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`.

## Import

The folder carries both manifests Bruno looks for: `bruno.json` (Import
dialog / older builds) and `collection.bru` (current builds).

1. **Import Collection -> from file system** and select this `bruno` folder,
   or **Collection -> Open Collection** and select it.
2. Pick an environment, top right:
   - **local**: `http://localhost:3000`, the service run with
     `npm run start:dev` or by `windows/start-windows.ps1`.
   - **docker**: `http://localhost:3000`, the service in `docker compose`
     (the same port since the host ports were standardised; see the root README).
3. **Run Collection**. Requests run in the numbered order.

## Prerequisites

- The service is running and its database has the Sprint 3 seed.
- The seeded holder of account 1 can log in: `john.carter@example.com` /
  `seed-password-change-me`; every request sends the digest the UIs send in
  its place (B23), computed in a pre-request script. A database seeded before that password existed
  needs the `UPDATE` in `windows/windows-setup.md` (Troubleshooting).

## What a green run proves

- Register: `201` for a new user, with no token and no `accountId` (no
  trading account is opened at registration). The same email in upper case
  is `409 AUTH-409`. A body naming an `accountId`, or a username that is not
  an email, is `422 VAL-422`.
- Login: the new user is refused with `401` until an account is opened for
  them. The seeded holder gets `200` with `expiresIn: 900`, and the access
  token carries exactly `sub, accountId, roles, iat, exp, iss`, with
  `iss = auth-service`, `exp - iat = 900`, `accountId = 1`, roles `[CUSTOMER]`
  and no email anywhere.
- A wrong password and an unknown email both get the same two-key
  `401 AUTH-401` body.
- `/auth/me`: `200` with the token's user, `401` with no token or a tampered
  one.
- Refresh: `200` rotation, then the spent token replayed is `401`, and the
  chain it belonged to is dead (`401`). Unknown token or missing field:
  `401` / `422`. Every failure body is exactly `{errorCode, message}`.

## Notes

- Tokens and the generated email are runtime variables (`bru.setVar`), so a
  run never writes anything back into `environments/*.bru`.
- Each run has 3 failed logins, and the service locks an IP out after 5
  failed logins in 15 minutes, so repeating the run inside 15 minutes soon
  fails at `login ok` (the third run does). Wait, or restart the service,
  which clears the count.
- The last two refresh requests are destructive by design (they prove reuse
  revocation and end that login's session); log in again afterwards.
