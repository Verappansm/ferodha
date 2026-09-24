# Decision: password storage, cost factor and log hygiene

## 1. Algorithm: bcrypt, cost 12

Passwords are hashed with **bcrypt at cost 12** (`PasswordService.COST`, library `bcryptjs`). This meets the contract's rule: argon2id or bcrypt at cost 12 or above; never MD5, never SHA-256, never an unsalted hash.

A general-purpose digest (MD5, SHA-1, SHA-256) is built to be fast, and fast is the one property a password hash must not have: a stolen table of them can be guessed at billions of attempts per second on a GPU. bcrypt is deliberately slow and tunable, and generates a random salt for every hash, so identical passwords produce different hashes and precomputed tables do not work.

Proved by `src/auth/password.service.spec.ts`: the correct password verifies; an incorrect one (including near misses) fails; the stored value is a bcrypt string at cost 12 or above and contains neither the plaintext nor any MD5/SHA-1/SHA-256/SHA-512 digest of it; hashing the same password twice gives different results (salted).

## 2. Credential store

Credentials live in the platform's existing `Users` table (Sprint 3 schema): `email` is the username, `password_hash` the bcrypt string, `role_id` the role. The auth service creates no user table. Its bootstrap (`src/persistence/schema.ts`, mirrored in `database/migrations/002_auth_service.sql`) only adds `Users.account_id` and creates `auth_refresh_tokens`; both are idempotent.

`src/persistence/users.repository.ts` is the only code that reads or writes `password_hash`. Registration hashes before calling `UsersRepository.create`, so the plaintext never reaches the database (proved by `src/auth/register-credentials.spec.ts`). The password is `writeOnly` in the contract: no response includes it or its hash.

Existing rows seeded by the platform, checked with:

```sql
SELECT LEFT(password_hash, 7) AS prefix, COUNT(*) FROM Users GROUP BY 1;
```

| prefix | count |
|---|---|
| _fill in_ | _fill in_ |

_Every row should start `$2a$12$` / `$2b$12$` or higher. Any other prefix is a finding: record it with the fix plan (forced reset, or rehash on next successful login)._

## 3. Cost factor: why 12

The target is one verification on the order of **0.1 s on the hardware we deploy to**. The trade-off is two-sided:

- **Too low**, and an attacker who steals the database gets the same speed advantage we built in: every guess against every hash is cheap.
- **Too high**, and `POST /auth/login` becomes the cheapest denial-of-service target in the platform: each request, valid or not, costs one full bcrypt run of CPU (unknown emails too, because of the timing decoy).

Measured with `node scripts/bcrypt-cost-benchmark.mjs` on the deployment target:

| Environment | CPU / cores | Node | Cost 11 | Cost 12 | Cost 13 |
|---|---|---|---|---|---|
| _fill in (e.g. prod container)_ | _fill in_ | _fill in_ | _ms_ | _ms_ | _ms_ |

_Fill in the conclusion from the numbers, for example: "Cost 12 measured N ms. The contract sets 12 as the floor, so we cannot go lower even though cost 11 is closer to 100 ms; cost 13 (~2N ms) would double the CPU an attacker can make us spend per login request for no requirement we have. Cost 12 is therefore both the minimum allowed and the best fit for our hardware."_

`bcryptjs` is pure JavaScript and slower than the native `bcrypt` package at the same cost; the numbers reflect what the service actually runs. Existing hashes keep their own cost (it is stored in the hash string), so raising `COST` later affects new hashes only.

## 4. Password length rules

The contract fixes `minLength: 12`, `maxLength: 128`, and length only - no symbol, digit or case requirement, because character-class rules push users towards shorter passwords. Proved by `src/auth/dto/register-request.dto.spec.ts`.

**Accepted residual risk - bcrypt's 72-byte limit.** bcrypt uses only the first 72 bytes of its input. The contract allows up to 128 characters (and a multi-byte character is more than one byte), so two passwords that share their first 72 bytes verify as each other. 72 bytes is still far beyond anything guessable, so the practical risk is negligible; the alternatives (argon2id, which has no such limit, or pre-hashing) would add a native dependency or a construction that is easy to get wrong. Revisit if the team moves to argon2id.

## 5. Logging

All logging goes through **one logger**, `RedactingLogger` (`src/common/logging/`), installed in `main.ts` so every `new Logger(...)` in the service writes through it. It redacts any key whose name contains password, passwd, passphrase, secret, token, authorization, cookie, apikey or credential, at any depth, in objects, arrays, Maps and properties attached to errors - without mutating the caller's object. Proved by `src/common/logging/redact.spec.ts`.

Redaction by key cannot see inside strings, so the indirect routes were closed at their source (proved by `src/common/all-exceptions.filter.spec.ts` and `src/common/validation.pipe.spec.ts`):

| Indirect route | Fix |
|---|---|
| An unexpected error's `stack` starts with its message, which may quote a credential | The exception filter logs the exception type and the stack **frames** only, never the first line |
| A `ValidationError` carries the submitted DTO (`target`) and the rejected value (`value`) - the whole body, password included - on the exception object | The ValidationPipe is built with `validationError: { target: false, value: false }`, so neither is ever attached |
| Nest's 404 message quotes the full URL, query string included (`?refreshToken=...`) | 4xx log lines carry the status, errorCode and exception type, never the message |
| A whole request body handed to a log call | No log call receives a request, a body or a DTO; reviewed with `grep -rnE "console\.|Logger|\.body" src` |

The contract's rule covers tokens as well as passwords: access tokens, refresh tokens and `Authorization` headers are redacted by the same key list and never appear in the filter's log lines.
