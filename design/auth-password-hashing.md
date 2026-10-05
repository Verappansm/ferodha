# Decision: password storage, cost factor and log hygiene

## 1. Algorithm: bcrypt, cost 12

Passwords are hashed with **bcrypt at cost 12** (`PasswordService.COST`, library `bcryptjs`). This meets the contract's rule: argon2id or bcrypt at cost 12 or above; never MD5, never SHA-256, never an unsalted hash.

A general-purpose digest (MD5, SHA-1, SHA-256) is built to be fast, and fast is the one property a password hash must not have: a stolen table of them can be guessed at billions of attempts per second on a GPU. bcrypt is deliberately slow and tunable, and generates a random salt for every hash, so identical passwords produce different hashes and precomputed tables do not work.

Proved by `src/auth/password.service.spec.ts`: the correct password verifies; an incorrect one (including near misses) fails; the stored value is a bcrypt string at cost 12 or above and contains neither the plaintext nor any MD5/SHA-1/SHA-256/SHA-512 digest of it; hashing the same password twice gives different results (salted).

## 2. Credential store

Credentials live in the platform's existing `Users` table (Sprint 3 schema): `email` is the username (stored lower-case), `password_hash` the bcrypt string, `status` and `role_id` as the platform defines them. The auth service creates no user table. Its only table is `auth_refresh_tokens`, created at start-up by `src/persistence/schema.ts`; nothing about it lives in `database/`. A user is registered on their own, and a trading account is opened for them afterwards (`Accounts.user_id`), so the service keeps no account link of its own.

`src/persistence/users.repository.ts` is the only code that reads or writes `password_hash`. Registration hashes before calling `UsersRepository.create`, so the plaintext never reaches the database (proved by `src/auth/register-credentials.spec.ts`). The password is `writeOnly` in the contract: no response includes it or its hash.

Existing rows seeded by the platform, checked with:

```sql
SELECT LEFT(password_hash, 7) AS prefix, COUNT(*) FROM Users GROUP BY 1;
```

| Row | prefix | Notes |
|---|---|---|
| 6 users in `database/seeds/001_seed_data.sql` | `$2b$12# Decision: password storage, cost factor and log hygiene

## 1. Algorithm: bcrypt, cost 12

Passwords are hashed with **bcrypt at cost 12** (`PasswordService.COST`, library `bcryptjs`). This meets the contract's rule: argon2id or bcrypt at cost 12 or above; never MD5, never SHA-256, never an unsalted hash.

A general-purpose digest (MD5, SHA-1, SHA-256) is built to be fast, and fast is the one property a password hash must not have: a stolen table of them can be guessed at billions of attempts per second on a GPU. bcrypt is deliberately slow and tunable, and generates a random salt for every hash, so identical passwords produce different hashes and precomputed tables do not work.

Proved by `src/auth/password.service.spec.ts`: the correct password verifies; an incorrect one (including near misses) fails; the stored value is a bcrypt string at cost 12 or above and contains neither the plaintext nor any MD5/SHA-1/SHA-256/SHA-512 digest of it; hashing the same password twice gives different results (salted).

## 2. Credential store

Credentials live in the platform's existing `Users` table (Sprint 3 schema): `email` is the username (stored lower-case), `password_hash` the bcrypt string, `status` and `role_id` as the platform defines them. The auth service creates no user table. Its only table is `auth_refresh_tokens`, created at start-up by `src/persistence/schema.ts`; nothing about it lives in `database/`. A user is registered on their own, and a trading account is opened for them afterwards (`Accounts.user_id`), so the service keeps no account link of its own.

`src/persistence/users.repository.ts` is the only code that reads or writes `password_hash`. Registration hashes before calling `UsersRepository.create`, so the plaintext never reaches the database (proved by `src/auth/register-credentials.spec.ts`). The password is `writeOnly` in the contract: no response includes it or its hash.

Existing rows seeded by the platform, checked with:

```sql
SELECT LEFT(password_hash, 7) AS prefix, COUNT(*) FROM Users GROUP BY 1;
```

 | Real bcrypt of the documented dev password `seed-password-change-me`, so the seeded account holders can log in locally. Earlier they held placeholder strings that were not bcrypt at all. |
| Market maker (trade_api Liquibase `006`) | `$2b$12# Decision: password storage, cost factor and log hygiene

## 1. Algorithm: bcrypt, cost 12

Passwords are hashed with **bcrypt at cost 12** (`PasswordService.COST`, library `bcryptjs`). This meets the contract's rule: argon2id or bcrypt at cost 12 or above; never MD5, never SHA-256, never an unsalted hash.

A general-purpose digest (MD5, SHA-1, SHA-256) is built to be fast, and fast is the one property a password hash must not have: a stolen table of them can be guessed at billions of attempts per second on a GPU. bcrypt is deliberately slow and tunable, and generates a random salt for every hash, so identical passwords produce different hashes and precomputed tables do not work.

Proved by `src/auth/password.service.spec.ts`: the correct password verifies; an incorrect one (including near misses) fails; the stored value is a bcrypt string at cost 12 or above and contains neither the plaintext nor any MD5/SHA-1/SHA-256/SHA-512 digest of it; hashing the same password twice gives different results (salted).

## 2. Credential store

Credentials live in the platform's existing `Users` table (Sprint 3 schema): `email` is the username (stored lower-case), `password_hash` the bcrypt string, `status` and `role_id` as the platform defines them. The auth service creates no user table. Its only table is `auth_refresh_tokens`, created at start-up by `src/persistence/schema.ts`; nothing about it lives in `database/`. A user is registered on their own, and a trading account is opened for them afterwards (`Accounts.user_id`), so the service keeps no account link of its own.

`src/persistence/users.repository.ts` is the only code that reads or writes `password_hash`. Registration hashes before calling `UsersRepository.create`, so the plaintext never reaches the database (proved by `src/auth/register-credentials.spec.ts`). The password is `writeOnly` in the contract: no response includes it or its hash.

Existing rows seeded by the platform, checked with:

```sql
SELECT LEFT(password_hash, 7) AS prefix, COUNT(*) FROM Users GROUP BY 1;
```

 but not a hash | `$2b$12$not_a_real_login`, deliberately unusable. |

Every registered user gets a real cost-12 hash. A stored value that is not a well-formed bcrypt string (the market maker, or an old database still holding the placeholders) is not a timing leak: `PasswordService.verify` sends it through the same decoy comparison an unknown email gets, so it still costs one full bcrypt run and still fails. A database seeded before the change needs the `UPDATE` in `windows/windows-setup.md`.

## 3. Cost factor: why 12

The target is one verification on the order of **0.1 s on the hardware we deploy to**. The trade-off is two-sided:

- **Too low**, and an attacker who steals the database gets the same speed advantage we built in: every guess against every hash is cheap.
- **Too high**, and `POST /auth/login` becomes the cheapest denial-of-service target in the platform: each request, valid or not, costs one full bcrypt run of CPU (unknown emails too, because of the timing decoy).

Measured with `node scripts/bcrypt-cost-benchmark.mjs` on the deployment target:

| Environment | CPU / cores | Node | Cost 11 | Cost 12 | Cost 13 |
|---|---|---|---|---|---|
| Team laptop, which is also what runs the Docker stack | Intel i3-1115G4, 4 cores | 20.14.0 | 182 ms | 366 ms | 705 ms |

Cost 10 measured 97 ms and cost 14 1351 ms on the same machine (median of 5 verifications each, 2026-09-28).

On this hardware the 0.1 s target sits at cost 10. The contract does not allow anything below 12, so 12 is the choice: it is the floor, and it is already about 3.5 times the target. Cost 13 would double that again (0.7 s) and double the CPU an attacker can make us spend per login request, for no requirement we have.

What we accept: every login attempt costs about 0.37 s of one core. The failed-login throttle (5 per IP per 15 minutes) caps what one address can make us spend on wrong guesses, but it does not cap successful logins or many addresses. For a training stack that is acceptable; on real hardware we would rerun the script and expect lower numbers.

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
