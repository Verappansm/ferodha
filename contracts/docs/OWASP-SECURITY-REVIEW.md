# Combined OWASP Security Review

**Scope:** trade_api · trade_executor · auth_service · trading-ui (client app and admin console)
**Standard:** OWASP Top 10 (2021), A01–A10
**Built from:** the Sprint 8 template (`auth_service/security-review/sprint8-review.md`): every category has a finding and a disposition
**Date:** 2026-10-07, revised 2026-10-08 (O-1 fixed, O-6 partly fixed, A04 watchlist route removed)
**Status:** Draft, open until Friday sign-off

---

## How to read this document

Every category gets one section. Each section has one row per module, with:

- **Finding:** what was checked, and the evidence at `file:line` (paths are relative to the repo root).
- **Disposition:** one of:
  - **Fixed:** already closed in code (the evidence shows where).
  - **Mitigated:** we state what limits the exposure.
  - **Accepted:** we state the residual risk.
  - **Out of scope:** we state why the category does not apply to that module.

Under each table, **Where it landed differently** explains why the modules diverge. That line matters more than any single row.

Supporting modules (pricing_generator, trades_generator, Kafka, docker-compose) appear where a core module depends on them.

> **Note on "Fixed":** this review found no fix committed during the review week. A "Fixed" disposition points to the code that already closes the risk. When an outstanding item is fixed, record its commit hash in the [Outstanding items](#outstanding-items) table.

---

## The two named risks this week

### R1: An internal path that another module calls and a customer's token can also reach

| Module | Finding | Disposition |
|---|---|---|
| trade_api | **As first reviewed (2026-10-07):** `POST /api/v1/notifications/internal/record` and `PATCH /api/v1/notifications/internal/{id}/status` sat under `/api/v1/**`, where `JwtAuthFilter` admits any valid customer token (`trade_api/src/main/java/com/trade/security/JwtAuthFilter.java`). Only a role check inside the controller stopped a customer token. **Now (2026-10-08):** both routes are removed. `NotificationController` maps only the customer's own list, read, read-all and get-by-id routes (`trade_api/src/main/java/com/trade/notification/controller/NotificationController.java:30-75`). Modules inside trade_api call each other through in-process interfaces that have no HTTP mapping (`preferences/PreferencesService.java:23-27`, [decision-log/0014](decision-log/0014-modules-call-each-other-through-named-interfaces.md)). The contract text in `contracts/notifications-api.yaml` still describes the old internal routes. | **Fixed (O-1).** Record the commit that removed the routes. Update `contracts/notifications-api.yaml` to drop them. |
| trade_executor | It exposes only actuator `health` (`trade_executor/src/main/resources/application.yml:135-139`). It calls pricing_generator's `/api/v1/quotes/{symbol}` and `/api/v1/quotes?symbols=` (`trade_executor/.../TradesGeneratorQuoteSource.java:44,62`) without any credential (`TradesGeneratorClientConfig.java:16-19`). `QuoteController` assumes it is reachable only on the compose network (`pricing_generator/.../web/QuoteController.java:17-19`). In fact it is published on host port 8084, trades_generator on 8083 and the executor on 8082 (`docker-compose.yml:148,202,235`). No customer token is involved because the endpoint checks no token at all. It serves read-only simulated prices. | **Mitigated:** the data is read-only and simulated. **Open (O-5):** bind these ports to `127.0.0.1`, or remove the host port mappings. |
| auth_service | No route exists for other services to call. The only token-protected routes are `/auth/me`, `/profile` and `/admin/**`. A customer token cannot reach `/admin/**`: `AdminJwtGuard` requires `aud=admin-console` and the `ADMIN` role (`auth_service/src/admin/admin-jwt.guard.ts:47-61`). An admin token cannot reach customer routes: `JwtAuthGuard` requires an integer `accountId` (`auth_service/src/auth/jwt-auth.guard.ts:91-92`), which admin tokens never carry (`auth_service/src/admin/admin.service.ts:69-77`). | **Accepted.** Residual risk: the two token types are kept apart by claim shape rather than by audience. See A07 (O-9). |
| trading-ui | No dev proxy, and no `internal` call in either app. The bearer token is attached only to an exact allow-list: the trade API under `/api/v1/`, plus `/auth/me` and `/profile` (`trading-ui/src/app/core/http/token-allow-list.ts:26-49`). The client app and the admin console are separate projects with separate session keys. Since the deployment-week change they share one origin (the console is served under `/admin` on 4200), so they are no longer isolated by origin: a script running in one could read the other's session storage in the same tab. Operators should keep the console in its own browser tab. | **Out of scope:** the browser never touches an internal route. |

**Where it landed differently:** trade_api closed its risk by removing the path entirely: internal calls are now in-process interfaces that no token can reach. The only unauthenticated internal path left is in trade_executor's dependency, pricing_generator. It needs no customer token, only network reach.

### R2: A customer-supplied destination that the platform then posts to

| Module | Finding | Disposition |
|---|---|---|
| trade_api | Notification channels are the enum `EMAIL` or `IN_APP` (`trade_api/.../notification/enums/NotificationChannel.java`, `UpdateNotificationPreferencesRequestDto.java:9`). The email address is read from the database, not from the request (`trade_api/.../preferences/DefaultPreferencesService.java:109-113`), and it is masked on output (`:192-200`). There is no webhook or callback field anywhere: a search for `RestTemplate`, `RestClient`, `WebClient`, `HttpClient` and `webhook` turned up nothing. Outbound URLs come only from environment variables (`trade_api/.../admin/service/SystemHealthService.java:38-77`). | **Out of scope:** no customer-supplied destination exists. |
| trade_executor | Both outbound base URLs come from configuration. The symbol is placed into the URL path through a URI template, which encodes it (`FauxnanceQuoteClient.java:101,124`; `TradesGeneratorQuoteSource.java:44,62`). The only outputs are Kafka topics. | **Out of scope:** no customer-supplied destination exists. |
| auth_service | **The one real destination is the registration email address.** Verification mail goes to whatever address was registered (`auth_service/src/auth/auth.controller.ts:78`). The mail contains a code only, with no link, so no Host-header injection is possible (`auth_service/src/mail/mail.service.ts:21-53`). `/auth/register` is not throttled, so anyone can make the platform send one mail per registration to any address. Resend is capped at one per minute per user (`auth_service/src/auth/email-verification.service.ts:55`). | **Open (O-6):** add a per-IP throttle on register and resend-code. |
| trading-ui | No form takes a URL, webhook or callback. Preferences offer only `IN_APP` or `EMAIL` (`trading-ui/src/app/api/generated/preferences/model/notification-channel.ts`). | **Out of scope.** |

**Where it landed differently:** nobody posts to a customer URL, so the classic webhook SSRF does not exist anywhere. The risk turns up in auth_service as a customer-chosen *email* destination, where the impact is mail abuse rather than SSRF.

---

## A01 Broken Access Control

Every brief names this risk first.

| Module | Finding | Disposition |
|---|---|---|
| trade_api | **No IDOR (insecure direct object reference).** `AccountAccessGuard` compares the path or body account ID with the token's (`trade_api/.../service/AccountAccessGuard.java:25-36`), and it is used in `AccountService.java:150-153`, `BankFundsService.java:40,63`, `OrderService.java:63,124,176` and `PortfolioService.java:197-201`. Watchlists filter by `userId`, strategies use `owned()`, and single-notification reads check the owner (`NotificationController.java:68`). `/api/v1/admin/**` requires the admin audience, the ADMIN role and a blocked-admin check (`JwtService.java:81-97`, `JwtAuthFilter.java:84`). Strategy tokens are limited to `POST /api/v1/orders` (`JwtAuthFilter.java:104-115`). | **Fixed** (existing code). The internal routes are removed (R1, O-1 fixed). |
| trade_executor | It trusts any message on the `orders` topic once `eventType` and `orderId` are present (`trade_executor/.../OrderPlacedListener.java:59-64`). Status comes from the database (`OrderExecutionService.java:89-100`), but **FX rates come from the message** (`:119-125`). If a forged message reaches the executor before the real one, it settles a `NEW` order at the attacker's rate. | **Open (O-2):** store the rates on the order row and stop trusting the payload. Also restrict who can produce to the topic (A05). |
| auth_service | Identity comes only from the verified token (`auth_service/src/auth/jwt-auth.guard.ts:34-35`). Self-registration is pinned to the `client` role (`auth_service/src/persistence/users.repository.ts:108`). Admins cannot act on their own account (`admin.service.ts:154`). Unknown body fields are rejected (`auth_service/src/common/validation.pipe.ts:222`). | **Fixed** (existing code). |
| trading-ui | The admin guard is client-side only, and the code says so (`trading-ui/projects/admin/src/app/core/guards/admin.guard.ts:12-24`). The backend role check is the real control. The client app's `returnUrl` is validated when it is written (`auth.guard.ts:10-25`) but **not when it is read** (`trading-ui/src/app/components/login/login.component.ts:148-149`), and the interceptor writes an unchecked one (`auth-token.interceptor.ts:79`). `navigateByUrl` stays in-app, so this cannot send a user to another site. | **Accepted** for the guard: the backend enforces roles. **Open (O-12):** reuse the admin console's `safeReturnUrl` in the login component. |

**Where it landed differently:** the three HTTP modules enforce access per request. trade_executor has no caller identity at all, so its access control is whoever can write to Kafka. That makes it the weakest A01 row.

---

## A02 Cryptographic Failures

| Module | Finding | Disposition |
|---|---|---|
| trade_api | The HS256 secret is required at boot (`JwtService.java:41-47`). However, compose falls back to `dev-only-jwt-signing-secret-please-change-later` and to the Postgres credentials `trade/trade` (`docker-compose.yml:11,90,91,120`). `.env.example` leaves these blank. BCrypt is used for passwords and PINs (`BankFundsService.java:92`). | **Open (O-3):** use `${JWT_SECRET:?required}` with no default and enforce a minimum key length. |
| trade_executor | Kafka uses PLAINTEXT (`docker-compose.yml:42-44`). The Fauxnance URL scheme is not enforced, so `X-Api-Key` would travel over plain HTTP if the URL were misconfigured (`FauxnanceClientConfig.java:16-20`). | **Accepted** for local dev. Residual risk: data in transit on a shared network is readable. Use SASL_SSL and https before any shared deployment. |
| auth_service | bcrypt cost 12. Refresh tokens are 384-bit and stored as SHA-256. The 32-byte JWT key is checked at boot. OTPs are stored as an unkeyed `sha256(userId:code)` (`auth_service/src/auth/email-verification.service.ts:90-91`). With only 10⁶ possible codes, a stolen database reverses live codes instantly. | **Accepted.** Residual risk: a database thief can verify unverified accounts within the 10-minute OTP lifetime. HMAC with a server key would close this. |
| trading-ui | API base URLs are `http://localhost` (`trading-ui/src/environments/environment.ts`). The PIN is bcrypted in the browser with a **fixed, public salt** (`trading-ui/src/app/components/bank/bank.component.ts:16,71`): there are 10⁴ PINs, the same hash for every user, and the hash replays as the PIN. | **Open (O-10):** add a production config with https URLs. Treat `pinHash` as the PIN itself: the server re-hashes it and rate-limits attempts. |

**Where it landed differently:** the backends are sound at rest (bcrypt, hashed tokens) but weak on defaults and transport. The UI has the reverse problem: it does crypto in the browser that adds no protection.

---

## A03 Injection

| Module | Finding | Disposition |
|---|---|---|
| trade_api | No `${}` in `trade_api/src/main/resources/mapper/*.xml` or annotations. All values are bound with `#{}`, and requests are checked with `@Valid`. | **Fixed** (existing code). |
| trade_executor | No `${}` in any mapper of the executor, pricing_generator or trades_generator. URIs are built from templates. | **Fixed** (existing code). |
| auth_service | All SQL is parameterised. The admin search builds placeholders only, and `q` is bound (`auth_service/src/admin/admin-users.repository.ts:133-154`). Mail is text-only, so no header injection is possible. | **Fixed** (existing code). |
| trading-ui | No `bypassSecurityTrust*` or `eval`. The three `innerHTML` writes use constant strings (`trading-ui/src/app/components/watchlist/watchlist.component.ts:256,290,305`). | **Accepted.** Switching to `textContent` is a tidy-up. |

**Where it landed differently:** this is the one category where all four modules land the same, clean.

---

## A04 Insecure Design

| Module | Finding | Disposition |
|---|---|---|
| trade_api | Customer and admin tokens share one HS256 secret and are separated only by audience. Anyone holding the secret can mint admin tokens. (The unthrottled `POST /notifications/watchlist/alert` noted on 2026-10-07 is removed; price alerts now go in-process through `PriceAlertNotifier`.) | **Accepted.** Residual risk: a leaked secret equals admin access. RS256 is the production design. |
| trade_executor | The envelope has no integrity field (`envelope-contract.md:12`), and producers are not authenticated (see A01). Idempotency is sound: a replayed settled order is a no-op (`OrderExecutionService.java:93-96`). | **Open (O-2)**, same fix as A01. |
| auth_service | **The OTP attempt cap can be bypassed.** Resend resets `attempts = 0` (`auth_service/src/persistence/email-otps.repository.ts:31-35`, `email-verification.service.ts:58`), and `/auth/verify-email` has no IP throttle (`auth_service/src/auth/verification.controller.ts:34`). That allows about 7,200 guesses a day, a roughly 0.7% daily chance per target. | **Open (O-4):** keep a per-user total across resends, and throttle by IP. |
| trading-ui | `STR-*` strategy error messages are displayed verbatim (`trading-ui/src/app/components/strategies/strategies.component.ts:76-78`). Angular escapes them, so they are safe. | **Accepted.** This relies on the backend's `ErrorResponse` envelope. |

**Where it landed differently:** each module's design flaw is in its own trust boundary: a shared key (trade_api), an unsigned bus (trade_executor), a resettable counter (auth_service). None of the three is shared across modules.

---

## A05 Security Misconfiguration

| Module | Finding | Disposition |
|---|---|---|
| trade_api | CORS uses an explicit allow-list without credentials (`trade_api/.../web/CorsConfig.java:26-43`). Actuator exposes `health` only. Errors are generic (`GlobalExceptionHandler.java`). One quirk: a malformed header in `listNotifications` returns 500 instead of 401 (`NotificationController.java:167-177`). | **Accepted:** the filter rejects bad tokens first. |
| trade_executor | **Compose publishes 5432, 9092 (Kafka, unauthenticated) and 8091 (kafka-ui, no auth, which can produce messages)** on the host (`docker-compose.yml:7,35,69`). Images use the `:latest` tag. | **Open (O-5):** bind to `127.0.0.1` or remove the mappings, keep kafka-ui out of non-dev runs, and pin image tags. |
| auth_service | **No helmet**, so `X-Powered-By` is sent and security headers are missing. `/docs` Swagger is always on (`auth_service/src/main.ts:16`). **`trust proxy` is unset**, so behind a load balancer every client shares the proxy's IP, and five failures lock out everyone (`auth_service/src/auth/login-throttle.guard.ts:13`). CORS is good (`auth_service/src/cors.ts:9-17`). | **Open (O-7):** add helmet, disable `/docs` in production, and set `trust proxy`. |
| trading-ui | **No CSP** and no framing or nosniff headers. No serving config is in the repo. The inline theme script needs a hash (`trading-ui/src/index.html:12`). | **Open (O-11):** add CSP, `frame-ancestors` and nosniff headers wherever the app is served. |

**Where it landed differently:** each module's misconfiguration lives somewhere different: compose for the executor, app bootstrap for auth_service, the missing hosting config for the UI. trade_api is the only well-configured row.

---

## A06 Vulnerable and Outdated Components

| Module | Finding | Disposition |
|---|---|---|
| trade_api | `spring-security-crypto` is pinned to **6.3.3** (`trade_api/pom.xml:42-43`), overriding Boot 3.5.5's managed version. That version is in range for CVE-2025-22228 (BCrypt passwords longer than 72 bytes). The code calls `BCrypt.checkpw` directly, which limits the exposure. | **Open (O-8):** remove the pin so Boot manages the version. |
| trade_executor | Boot 3.5.5, MyBatis 3.0.4 and Testcontainers 1.20.4 are current (`trade_executor/pom.xml:12,24,95`). | **Accepted.** Residual risk: there is no automated CVE scan. |
| auth_service | The resolved dependencies are past the known advisories (nodemailer 7.0.13, express 5.2.1, jsonwebtoken 9.0.3, multer 2.4.0). The base image `node:20-alpine` is end-of-life (April 2026) and unpinned (`auth_service/Dockerfile`). | **Open (O-13):** move to Node 22 or 24 and pin the image digest. |
| trading-ui | Angular ^21.2 and other recent versions, mostly with `^` ranges, plus a lockfile. `npm audit` has not been run. | **Accepted.** Residual risk: the lockfile limits drift, but no audit runs in CI. |

**Where it landed differently:** only trade_api has an actual known-vulnerable version, and it got there by hand: a manual pin went stale. Everything else is current, though no module runs a scanner (see O-13).

---

## A07 Identification and Authentication Failures

| Module | Finding | Disposition |
|---|---|---|
| trade_api | Signature, expiry, `alg=HS256`, `iss=auth-service` and audience are all verified (`JwtService.java:105-127`). The blocked-user check runs per request, so suspension is immediate (`JwtAuthFilter.java:84,100`). | **Fixed** (existing code). |
| trade_executor | The executor has no user authentication and no service-to-service authentication on HTTP or Kafka. | Covered by O-2 and O-5. |
| auth_service | The decoy hash and identical 401s defeat user enumeration (`auth_service/src/auth/auth.service.ts:112-123`). Refresh rotation has reuse detection. Change-password revokes all refresh tokens (`auth.service.ts:170`, `refresh-tokens.repository.ts:105-112`). The login limiter is in-memory and per instance (`auth_service/src/auth/login-attempt-limiter.ts:55-57`). **`JwtAuthGuard` does not pin `iss` or reject `aud`** (`jwt-auth.guard.ts:54-57,98`). `AdminJwtGuard` does not re-check admin status, so a suspended admin keeps access for up to 15 minutes. | **Open (O-9):** pin the issuer and reject `aud` in `JwtAuthGuard`. **Accepted:** the in-memory limiter, whose residual risk is a reset on restart. |
| trading-ui | Tokens are kept in `sessionStorage` (`trading-ui/src/app/core/session/session.ts:20-24`), so script can read them. Combined with the missing CSP, any XSS steals the session. | **Accepted.** Residual risk: token theft via XSS, bounded by the 15-minute access TTL. Mitigated once O-11 lands. |

**Where it landed differently:** trade_api verifies tokens more strictly than auth_service, the service that issues them. trade_api pins the issuer and re-checks blocked status. auth_service does neither on its own guards.

---

## A08 Software and Data Integrity Failures

| Module | Finding | Disposition |
|---|---|---|
| trade_api | It consumes `trade-events` and `market-data` over PLAINTEXT with no producer authentication (`trade_api/src/main/resources/application.yml:20-33`). Forged fills or prices would drive notifications, portfolio values and strategies. | Covered by O-5 (network) and O-2 (payload trust). |
| trade_executor | Deserialization is safe: fixed generic types, no polymorphic typing, String serdes (`OrderPlacedListener.java:51-53`). Bad messages go to the DLT on the first attempt (`KafkaConsumerConfig.java:43,52`). | **Fixed** for deserialization. Integrity is covered by O-2. |
| auth_service | `alg` is pinned to HS256 on every verify. `npm ci` installs from the lockfile. | **Accepted.** Residual risk: images and dependencies are unsigned. |
| trading-ui | No CDN scripts: everything is bundled. The generated clients are checked by `check:api`. | **Accepted.** |

**Where it landed differently:** the integrity risk sits on the Kafka bus. It hits both Java services, from opposite sides: the executor consumes `orders`, and trade_api consumes `trade-events`. The two Node/Angular modules don't touch the bus.

---

## A09 Security Logging and Monitoring Failures

| Module | Finding | Disposition |
|---|---|---|
| trade_api | Admin actions are written to `admin_audit` in the same transaction (`trade_api/.../admin/service/AdminAuditLog.java`, `@Transactional(MANDATORY)`). **401 and 403 responses in `JwtAuthFilter` are not logged.** | **Open (O-14):** log 401/403 at WARN with the route and subject. |
| trade_executor | Every raw `ORDER_PLACED` envelope is logged at INFO, including account and rates (`OrderPlacedListener.java:34`). There is no alerting on DLT depth (`kafka.md:101-105`). | **Open (O-15):** log only IDs at INFO, and alert on DLT depth. |
| auth_service | Key-based redaction runs through a global logger (`auth_service/src/common/logging/redact.ts`). When `SMTP_HOST` is unset, the OTP code is logged at WARN. **Since 2026-10-08 this happens in development only:** with `NODE_ENV=production`, `send` throws instead of logging (`auth_service/src/mail/mail.service.ts:24-26`), and `mail.service.spec.ts` covers it. | **Fixed** (O-6, the logging half). The register throttle half of O-6 is still open. |
| trading-ui | The global error handler routes to `/error` without showing a stack trace (`trading-ui/src/app/core/errors/global-error-handler.ts:26`). | **Out of scope:** security logging belongs to the backends. |

**Where it landed differently:** trade_api and trade_executor log too little in one place and too much in another. auth_service is the one place where a secret actually reaches the log.

---

## A10 Server-Side Request Forgery (SSRF)

| Module | Finding | Disposition |
|---|---|---|
| trade_api | Outbound HTTP goes only to fixed environment URLs (`SystemHealthService.java:38-77`, `strategy/HttpOrderPlacer.java`). No customer-supplied URL exists (R2). | **Out of scope:** there is no attacker-controlled destination. |
| trade_executor | Hosts come from config only, and paths use templates. The HTTP clients have no timeouts (`TradesGeneratorClientConfig.java:17-19`, `FauxnanceClientConfig.java:18-21`), so a hung upstream can stall the consumer. That is an availability issue, not SSRF. | **Out of scope** for SSRF. **Open (O-16):** set connect and read timeouts. |
| auth_service | No outbound HTTP. The SMTP host comes from env only. | **Out of scope:** no outbound fetch. |
| trading-ui | A browser SPA makes no server-side requests. | **Out of scope:** SSRF needs a server-side fetch. |

**Where it landed differently:** SSRF does not apply anywhere, because no module fetches a destination a customer supplies (R2). Its nearest relative is the executor's outbound clients with no timeouts.

---

## Accepted residual risks

| Risk | Modules | Category |
|---|---|---|
| A leaked shared HS256 secret lets anyone mint admin tokens | trade_api, auth_service | A04 |
| Kafka and HTTP run in plaintext on the local network | trade_executor, trade_api | A02, A08 |
| A database thief can reverse live OTP codes (10-minute window) | auth_service | A02 |
| Session tokens can be read by script (sessionStorage) | trading-ui | A07 |
| The login limiter is in-memory, per instance, and resets on restart | auth_service | A07 |
| The admin route guard is client-side only (the backend enforces roles) | trading-ui | A01 |
| No automated CVE scanning | all | A06 |

## Outstanding items

> Every item below is still open. Each owner column names the module owner. Put a person's name against each item before Friday's sign-off, and fill in the fix commit when the item closes.

| ID | Finding | Module(s) | Category | Severity | Owner | Fix commit |
|---|---|---|---|---|---|---|
| O-1 | ~~Internal notification routes~~ **Fixed 2026-10-08:** routes removed; calls are in-process (decision 0014). Remaining: drop them from `contracts/notifications-api.yaml` | trade_api | R1, A01 | Low | trade_api owner | _add commit_ |
| O-2 | Executor settles at FX rates taken from an unauthenticated Kafka message | trade_executor | A01, A04, A08 | Medium | trade_executor owner | — |
| O-3 | Compose falls back to a public `JWT_SECRET` and `trade/trade` Postgres credentials | trade_api, compose | A02 | Medium | trade_api owner | — |
| O-4 | OTP attempt cap resets on resend; no IP throttle on verify-email | auth_service | A04 | Medium | auth_service owner | — |
| O-5 | Kafka 9092, kafka-ui 8091, Postgres 5432 and generator ports 8082–8084 published on the host without auth | trade_executor, compose | R1, A05 | High if host reachable | trade_executor owner | — |
| O-6 | Register is unthrottled (mail abuse). ~~OTP logged when `SMTP_HOST` unset~~ **fixed 2026-10-08:** production now throws instead | auth_service | R2, A09 | Medium | auth_service owner | _add commit for the logging fix_ |
| O-7 | No helmet, `/docs` always on, `trust proxy` unset | auth_service | A05 | Medium | auth_service owner | — |
| O-8 | `spring-security-crypto` pinned to 6.3.3 (CVE-2025-22228 range) | trade_api | A06 | Low–Medium | trade_api owner | — |
| O-9 | `JwtAuthGuard` doesn't pin `iss` or reject `aud`; admin guard doesn't re-check status | auth_service | A07 | Low | auth_service owner | — |
| O-10 | http API URLs; PIN bcrypted with a fixed public salt | trading-ui | A02 | Medium | trading-ui owner | — |
| O-11 | No CSP or framing headers | trading-ui | A05 | Medium | trading-ui owner | — |
| O-12 | `returnUrl` not validated on read in login | trading-ui | A01 | Low | trading-ui owner | — |
| O-13 | Node 20 end-of-life base image; no CVE scan in CI for any module | auth_service, all | A06 | Low | auth_service owner | — |
| O-14 | 401/403 not logged in `JwtAuthFilter` | trade_api | A09 | Low | trade_api owner | — |
| O-15 | Full order envelope logged at INFO; no DLT alerting | trade_executor | A09 | Low | trade_executor owner | — |
| O-16 | No HTTP client timeouts on outbound calls | trade_executor | A10 | Low | trade_executor owner | — |

## Note on the Sprint 8 auth review

`auth_service/security-review/sprint8-review.md` is now stale in three places:
- **V2.6:** change-password and admin suspend/force-reset now revoke refresh tokens.
- **V2.7:** the limiter is custom and in-memory. It is not `@nestjs/throttler`, and `throttler-exception.filter.ts` does not exist.
- **V4.4:** admin endpoints now exist.

This document supersedes it for those rows.

## Sign-off

**Reviewed by:** Team 2
**Date:** 2026-10-07
