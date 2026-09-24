# Bruno collection - Sprint 8 auth service

Verifies all four contract endpoints end to end: `POST /auth/register`,
`POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`.

## Import

The folder carries both manifests Bruno looks for: `bruno.json` (Import
dialog / older builds) and `collection.bru` (current builds).

1. Either **Import Collection -> from file system** and select this `bruno`
   folder - or the `bruno.json` file inside it - or **Collection ->
   Open Collection** and select the `bruno` folder.
2. Top-right, switch the environment to **local** (`baseUrl =
   http://localhost:3000`).
3. **Run Collection** (play icon) - requests execute in the numbered order.

## Prerequisites

- The service is running: `cd auth_service && npm run start:dev`
  (first boot logs `Creating auth service tables`).
- Account with the numeric id `1` exists (`SELECT id FROM Accounts;` - the
  seed provides `ACC-000001`).

## What a green run proves

- Register: `201` with **no token keys**, duplicate -> `409 AUTH-409`,
  bad account / bad email -> `422 VAL-422`.
- Login: `200` with `expiresIn: 900`; the access-token payload has **exactly**
  `sub, accountId, roles, iat, exp, iss`, `iss = auth-service`,
  `exp - iat = 900`, integer `accountId = 1`, roles `[CUSTOMER]`, and no
  email anywhere in the payload.
- Wrong password and unknown email both answer an identical two-key
  `401 AUTH-401` envelope (run 02 twice to eyeball the bodies side by side).
- `/auth/me`: `200` with the registered identity, `401` with no token or a
  tampered one.
- Refresh: `200` rotation; the consumed token replayed -> `401` (theft); the
  chain it killed -> `401`; unknown token / missing field -> `401` / `422`.
  Every failure body is exactly `{errorCode, message}`.

## Notes

- Each run generates a fresh email, so the collection is repeatable.
- The last two refresh requests are **destructive by design** (they prove
  reuse-revocation and end the session); simply log in again afterwards.
- A script throws (red request) whenever a response violates one of the
  rules above - the message says which.
