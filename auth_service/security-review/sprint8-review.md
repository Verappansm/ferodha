# Sprint 8 OWASP Security Review

**Service:** auth-service  
**Sprint:** 8  
**Status:** Committed  
**Date:** 2026-09-28  

---

## Review Format

Each OWASP ASVS 4.0 category has two cells:
- **Finding:** What was checked and the result (e.g., "none" means no vulnerability found, with what was verified)
- **Disposition:** What was done about it (e.g., "accepted" with residual risk stated, "fixed", "mitigated")

Every category must have both cells filled.

---

## V2: Broken Authentication

### V2.1: Credential Storage

| Finding | Disposition |
|---------|-------------|
| Passwords stored as bcrypt hashes at cost 12 (`src/auth/password.service.ts:13-17`). No plaintext, MD5, SHA-256, or unsalted hashes present. Verified by code inspection. | Accepted. Residual risk: bcrypt cost 12 (~250ms/hash on current hardware) is the minimum the contract allows ("argon2id or bcrypt at cost 12 or above"). An offline attack on a stolen database is expensive but not infeasible for nation-state actors. Team accepts because upgrading to argon2id would require a migration and is not required by contract. |

### V2.2: Credential Verification

| Finding | Disposition |
|---------|-------------|
| Login uses constant-time verification: unknown email and wrong password both run bcrypt at cost 12 via `verifyAgainstDecoy` (`src/auth/password.service.ts:29-38`). Response body is identical (AUTH-401) for both cases (`src/auth/auth.service.ts:92-100`). | Accepted. Timing side channel eliminated for username enumeration. Residual risk: network-level timing variance remains but is outside service control. |

### V2.3: Session Management

| Finding | Disposition |
|---------|-------------|
| No server-side sessions. Stateless JWT access tokens (15 min TTL) + opaque refresh tokens (7 day TTL, SHA-256 hashed in DB) (`src/auth/auth.service.ts:39-42, 226-233`). Refresh tokens implement rotation with reuse detection (`src/auth/auth.service.ts:106-149`). | Accepted. Stateless design avoids session fixation and server-side session store risks. Residual risk: stolen access token usable for up to 15 min; stolen refresh token usable until rotation or 7-day expiry (see V2.6). |

### V2.4: Token Generation

| Finding | Disposition |
|---------|-------------|
| Access tokens: HS256, 256-bit key enforced at boot (`src/config/config.service.ts:9, 21-28`), claims restricted to contract set (sub, accountId, roles, iss, iat, exp) - no PII (`src/auth/auth.service.ts:201-222`). Refresh tokens: 384-bit cryptographically random (`randomBytes(48)`), opaque, no claims (`src/auth/auth.service.ts:225-228`). | Accepted. Key length meets RFC 7518 minimum for HS256. Residual risk: HS256 symmetric key compromise allows token forgery. Team accepts because asymmetric keys (RS256) add operational complexity not justified for this service scope. |

### V2.5: Token Transmission

| Finding | Disposition |
|---------|-------------|
| All auth endpoints served over HTTPS in production (enforced by infrastructure). Tokens only transmitted in Authorization header (`Bearer` scheme) and JSON response bodies. No tokens in URLs, cookies, or logs. | Accepted. Residual risk: TLS termination at load balancer means internal traffic may be unencrypted. Infrastructure responsibility. |

### V2.6: Token Revocation

| Finding | Disposition |
|---------|-------------|
| **Refresh tokens are single-use but not actively revoked in storage after legitimate rotation.** Rotation marks the presented token `used_at` (`src/persistence/refresh-tokens.repository.ts:79-89`) and issues a new token in the same family. Reuse detection revokes the entire family (`src/auth/auth.service.ts:123-127, src/persistence/refresh-tokens.repository.ts:95-102`). **No proactive revocation of a valid (unused, unexpired) refresh token is implemented** (e.g., on password change, logout, or admin action). | **Decision documented per sprint requirement.** Residual risk: A stolen but not-yet-used refresh token remains valid for up to 7 days (or until the legitimate user rotates it). The 15-minute access token lifetime limits the window for access token abuse, but a stolen refresh token grants full session takeover until expiry or rotation. Team accepts because: (1) short access token lifetime (15 min) limits damage from stolen access tokens; (2) refresh token rotation on each use means the token is only vulnerable until next legitimate use; (3) implementing proactive revocation (logout endpoint, password-change revocation, admin revocation) adds significant complexity (new endpoints, token metadata, cascade logic) for marginal risk reduction given the 7-day bound and rotation design. |

### V2.7: Authentication Rate Limiting

| Finding | Disposition |
|---------|-------------|
| Login endpoint protected by `@nestjs/throttler`: 5 requests per 15-minute window per IP (`src/auth/auth.module.ts:20-25`). Returns 429 with custom filter (`src/auth/throttler-exception.filter.ts`). | Accepted. Residual risk: Distributed attacks from many IPs can bypass per-IP limit. Team accepts because bcrypt cost 12 already imposes computational cost per attempt, and infrastructure WAF provides additional protection. |

### V2.8: Account Recovery

| Finding | Disposition |
|---------|-------------|
| No account recovery / password reset functionality implemented in this service. | Accepted. Out of scope for Sprint 8. Contract does not require it. |

---

## V4: Broken Access Control

### V4.1: Authorization Enforcement

| Finding | Disposition |
|---------|-------------|
| Protected route `/auth/me` guarded by `JwtAuthGuard` which verifies HS256 signature, expiry, and claim shape before any claim is read (`src/auth/jwt-auth.guard.ts:50-67`). Claims sourced **only** from verified token (`src/auth/auth.controller.ts:50-53`). | Accepted. No user-controlled input influences authorization decision. |

### V4.2: Role-Based Access Control

| Finding | Disposition |
|---------|-------------|
| Access token carries `roles` array from user record (`src/auth/auth.service.ts:213`). `JwtAuthGuard` validates `roles` is non-empty array of strings (`src/auth/jwt-auth.guard.ts:89-90`). Self-registered users pinned to `client` role; other roles assigned by admin processes outside this service (`src/auth/auth.service.ts:69-70`). | Accepted. Service issues tokens with correct roles; downstream services (Trade REST API) enforce role checks. Residual risk: role escalation if user record compromised (requires DB write access). |

### V4.3: Insecure Direct Object References (IDOR)

| Finding | Disposition |
|---------|-------------|
| `/auth/me` returns only the user identified by `sub` claim in verified token (`src/auth/auth.service.ts:152-161`). No user-supplied identifier accepted. | Accepted. No IDOR possible on this endpoint. |

### V4.4: Missing Function-Level Access Control

| Finding | Disposition |
|---------|-------------|
| All four routes have explicit guards: `register`/`login`/`refresh` public (`security: []` in contract), `me` requires valid JWT (`src/auth/auth.controller.ts`). No hidden/admin endpoints. | Accepted. |

---

## Token Leakage

### V7.1: Logging & Error Messages

| Finding | Disposition |
|---------|-------------|
| Single `RedactingLogger` installed at app root (`src/main.ts:9-11`). Redacts by key name: `password`, `hash`, `token`, `secret`, `authorization`, `cookie`, `apikey`, `key` (`src/common/logging/redact.ts`). All log levels pass through redaction. Error responses use fixed envelopes (`src/common/error-envelope.ts`) - no exception details leaked. | Accepted. Redaction is key-based, so interpolated strings containing secrets could leak if developer passes raw request body. Code review confirms no such patterns. Residual risk: new logging call with unredacted object could leak; mitigated by code review practice. |

### V7.2: Token in URLs / Referer

| Finding | Disposition |
|---------|-------------|
| Tokens never placed in URLs. `Authorization: Bearer` header only. No redirect with tokens. | Accepted. |

### V7.3: Token in Browser Storage

| Finding | Disposition |
|---------|-------------|
| Service is API-only; no browser code. Token storage is client responsibility. Access token short-lived (15 min); refresh token opaque. | Accepted. Client-side storage risks documented in API contract for consumers. |

### V7.4: Refresh Token Storage

| Finding | Disposition |
|---------|-------------|
| Only SHA-256 hash stored in `auth_refresh_tokens` table (`src/auth/auth.service.ts:231-233, src/persistence/refresh-tokens.repository.ts:42-43`). Raw token exists only in login/refresh response body. DB read access ≠ session takeover. | Accepted. Residual risk: if DB compromised, attacker gets hashes. Offline attack on 384-bit token infeasible. |

---

## Replay Attacks

### V9.1: Nonce / Timestamp Usage

| Finding | Disposition |
|---------|-------------|
| Access tokens: JWT `iat`/`exp` enforce 15-min lifetime (`src/auth/auth.service.ts:39, 219`). No nonce. Refresh tokens: rotation with reuse detection acts as single-use nonce per token (`src/auth/auth.service.ts:106-149`). Concurrent presentation of same refresh token: only one succeeds (`markUsed` conditional UPDATE, `src/persistence/refresh-tokens.repository.ts:79-89`). | Accepted. Replay of access token possible within 15-min window (stateless JWT). Refresh token replay detected and revokes family. Residual risk: access token replay within TTL window; mitigated by short TTL and HTTPS. |

### V9.2: Refresh Token Rotation

| Finding | Disposition |
|---------|-------------|
| Implemented: every refresh exchanges token for new one in same family (`src/auth/auth.service.ts:147-148`). Reuse = theft signal → family revoked (`src/auth/auth.service.ts:123-127`). | Accepted. See V2.6 for revocation limitations. |

---

## Weak Secrets

### V8.1: JWT Signing Key

| Finding | Disposition |
|---------|-------------|
| HS256 key (`JWT_SECRET`) validated at boot: must exist and be ≥ 32 bytes (256 bits) (`src/config/config.service.ts:9, 21-28`). Service refuses to start otherwise. Key sourced from environment, not code. | Accepted. Residual risk: symmetric key compromise = token forgery. Key rotation requires service restart and invalidates all active sessions. Team accepts operational burden. |

### V8.2: Bcrypt Cost Factor

| Finding | Disposition |
|---------|-------------|
| Fixed at cost 12 (`src/auth/password.service.ts:13`). Meets contract minimum. No configurable downgrade. | Accepted. Cost 12 is current industry baseline. Future upgrade to argon2id possible via migration. |

### V8.3: Entropy Sources

| Finding | Disposition |
|---------|-------------|
| `randomBytes` (Node.js CSPRNG) used for: refresh tokens (384 bits), decoy hash salt, JWT `sub` (UUID v4). No `Math.random()` or weak RNG. | Accepted. |

### V8.4: Database Credentials

| Finding | Disposition |
|---------|-------------|
| Postgres password in env, assembled into URL in config (`src/config/config.service.ts:73-75`). URL marked "never log this value" and key `password` redacted by logger. | Accepted. Standard practice. |

---

## V10: Security Logging & Monitoring

### V10.1: Security Event Logging

| Finding | Disposition |
|---------|-------------|
| Login failures (AUTH-401) logged via NestJS default logging through RedactingLogger. Throttler rejections (429) logged. No dedicated security event log (SIEM integration). | Accepted. Sprint scope. Residual risk: automated detection of brute force, credential stuffing requires external log aggregation. |

### V10.2: Audit Trail

| Finding | Disposition |
|---------|-------------|
| Refresh token family chain provides implicit audit: `issued_at`, `used_at`, `revoked_at` per token (`src/persistence/refresh-tokens.repository.ts:6-14`). Login creates new family; rotation extends family. | Accepted. Sufficient for forensics within service. |

---

## Summary of Accepted Residual Risks

| Risk | Category | Justification |
|------|----------|---------------|
| Stolen access token usable ≤15 min | V2.3 | Short TTL, stateless design, HTTPS |
| Stolen refresh token usable ≤7 days (or until rotation) | V2.6 | Rotation on use, 7-day bound, complexity vs. risk |
| HS256 symmetric key compromise = token forgery | V2.4, V8.1 | Operational simplicity, key rotation possible |
| bcrypt cost 12 offline attack feasible for nation-state | V2.1 | Contract minimum, migration path exists |
| Per-IP rate limit bypass via distributed IPs | V2.7 | bcrypt cost imposes compute cost; infra WAF |
| No proactive refresh token revocation (logout, password change) | V2.6 | See V2.6 disposition |

---

## Sign-Off

**Reviewed by:** Team 2  
**Date:** 2026-09-28  
**Status:** Committed - differs from template, carries written finding and disposition for every category.