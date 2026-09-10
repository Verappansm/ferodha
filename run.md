# run.md

Step-by-step checks for `trade_api` (Sprint 6), in the order to run them, on
a machine that already has **Docker** and **Postgres** — neither is started
by this repo. Each step says what it needs and what "it worked" looks like.
If something doesn't match, paste the actual error back rather than a
summary — that's literally how every bug fixed so far in this project got
found (see `CLAUDE.md`'s "Bugs found and fixed" section for the pattern).

## Prerequisites

- Java 21, Maven 3.9+ (only needed for steps 3-5, run outside Docker)
- A reachable Postgres instance — native on this machine, or its own
  container. This repo does not create one.
- `psql` on `PATH` (for step 2)
- Docker + Docker Compose (for step 6)

## 1. Configure `.env`

```bash
cp .env.example .env
```

Fill in `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `JWT_SECRET`.
`JWT_SECRET` must be **at least 32 characters** (256 bits) — HS256 requires
a key at least as long as its hash output (RFC 7518 section 3.2), and
`JwtService` refuses to start with anything shorter, with a message telling
you exactly how many bytes it got. `dev-only-jwt-signing-secret-please-change-later`
(48 characters) is a fine local/dev value; it just has to be the same value
everywhere it's read. Leave `POSTGRES_HOST`/`POSTGRES_PORT` as-is
(`localhost:5432`) if Postgres is native on this machine and you're running
`trade_api` directly (step 5). If Postgres is in its own container, or you're
running `trade_api` via Docker (step 6), see the comments in `.env.example`
and `docker-compose.yml` — you'll point `POSTGRES_HOST` at
`host.docker.internal` or at that container's name instead.

`.env` is git-ignored. Never put a real value in `.env.example` or any
committed file.

Filling in `.env` is not the same as those values being available to
`mvn spring-boot:run` — see step 5 for actually getting them into the
process.

## 2. Apply the Sprint 3 base schema (once, to a fresh database)

```bash
cd database
./apply.sh
```

Runs `migrations/001_initial_schema.sql` then `seeds/001_seed_data.sql`
against `.env`'s `POSTGRES_*` via `psql`. Skip this if the target database
already has the Sprint 3 schema and seed data loaded — it only needs doing
once per database. `trade_api` does **not** create this schema itself; its
own Liquibase changelog only adds Sprint 6's columns on top of it (see
`CLAUDE.md`, "The database gap this session had to close") and will fail if
this hasn't been run first.

**Expect**: `Database migration and seeding completed successfully.`

Optional sanity check, from the same directory:

```bash
./scripts/check.sh
```

**Expect**: `All probes passed.` (each probe passes when Postgres *rejects*
an invalid write — a duplicate idempotency key, an orphaned foreign key).

## 3. Run the automated test suite

```bash
cd trade_api
mvn clean verify
```

This needs **no Docker and no real Postgres** — every test here runs against
mocks or an in-process Spring context. Last run in this session:

```
Tests run: 101, Failures: 0, Errors: 0
BUILD SUCCESS
```

What's covered: the Sprint 5 domain rules (`AccountTest`, `OrderLogicTest`,
`PlaceOrderRequestValidationTest` — copied in unchanged from `java_module`),
JWT signature/expiry/algorithm checks and the filter
(`JwtServiceTest`, `JwtAuthFilterTest` — see step 4 below for this
specifically), the error-catalogue mapping (`GlobalExceptionHandlerTest`),
order placement and cancellation orchestration (`OrderServiceTest`), the
four account read operations (`AccountServiceTest`), and both controllers
end-to-end through a real filter with a real minted token but a mocked
service layer (`OrderControllerWebTest`, `AccountControllerWebTest`).

If this doesn't say `BUILD SUCCESS`, stop here and report the failure —
nothing past this point is worth trying until it does.

## 4. JWT specifically

Covered automatically by step 3 (`JwtServiceTest` + `JwtAuthFilterTest`,
12 tests: valid token accepted; expired, forged-signature, malformed, and
missing-`accountId`-claim tokens all rejected; missing header and wrong auth
scheme rejected; non-`/api/v1/` routes never challenged; blank `JWT_SECRET`
fails fast at startup).

To check it by hand against a *running* service (after step 5 or step 6),
mint a token signed with the same secret as your `.env`'s `JWT_SECRET`. This
needs only Python's standard library — no dependency to install:

```bash
python3 -c "
import base64, hashlib, hmac, json, sys, time

secret = sys.argv[1]
account_id = int(sys.argv[2]) if len(sys.argv) > 2 else 1

def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

now = int(time.time())
header = {'alg': 'HS256', 'typ': 'JWT'}
payload = {
    'sub': '11111111-1111-1111-1111-111111111111',
    'accountId': account_id,
    'roles': ['CUSTOMER'],
    'iat': now,
    'exp': now + 900,
    'iss': 'auth-service',
}
parts = [b64url(json.dumps(header, separators=(',', ':')).encode()),
         b64url(json.dumps(payload, separators=(',', ':')).encode())]
signing_input = '.'.join(parts).encode()
signature = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
parts.append(b64url(signature))
print('.'.join(parts))
" "$JWT_SECRET" 1
```

Then:

```bash
TOKEN=$(python3 <the same command above>)

# Expect 200 and a JSON AccountResponse for account id 1 (the seed data's
# first account - adjust accountId in the token above if you used a
# different one).
curl -i http://localhost:8080/api/v1/accounts/1 \
  -H "Authorization: Bearer $TOKEN"

# Expect 401, {"errorCode":"AUTH-401","message":"Unauthorised"}
curl -i http://localhost:8080/api/v1/accounts/1

# Expect 401, same body - a forged/garbage token
curl -i http://localhost:8080/api/v1/accounts/1 \
  -H "Authorization: Bearer not-a-real-token"
```

## 5. Run the service directly (no Docker)

**A `.env` file on disk does nothing by itself.** `docker compose` reads
`.env` automatically and `database/apply.sh` explicitly `source`s it, but
`mvn spring-boot:run` does neither — it only sees real environment
variables. Skipping this step is exactly what produces
`Could not resolve placeholder 'JWT_SECRET'` at startup (the bean fails
fast on purpose rather than starting with an empty/guessable secret).

PowerShell:

```powershell
cd trade_api
Get-Content ..\.env | Where-Object { $_ -match '^\s*[^#][^=]*=' } | ForEach-Object {
    $name, $value = $_.Split('=', 2)
    Set-Item -Path "Env:$($name.Trim())" -Value $value.Trim()
}
mvn spring-boot:run
```

Git Bash / WSL / macOS / Linux:

```bash
cd trade_api
set -a
source ../.env
set +a
mvn spring-boot:run
```

Either way this requires steps 1 and 2 already done, and
`POSTGRES_HOST=localhost` in `.env` (correct for this case — running the
jar directly, not via Docker). On startup, Liquibase runs this module's
changelog automatically — watch the log for `liquibase` lines completing
without error. Then repeat the `curl` checks in step 4 against
`localhost:8080`.

```bash
curl http://localhost:8080/actuator/health
```

**Expect**: `{"status":"UP"}`.

## 6. Mapper tests against a real (disposable) Postgres

```bash
cd trade_api
mvn test -DexcludedGroups=
```

`AccountMapperIT` and `OrderMapperIT` are excluded from the default
`mvn verify` run (step 3) because they need Docker — Testcontainers starts
its **own throwaway `postgres:16-alpine` container** for these, entirely
separate from whatever real Postgres you set up in step 2. It applies the
same `database/migrations/001_initial_schema.sql` this repo already has,
then this module's own Liquibase changelog on top, so the fixture matches a
real deployment.

**Not yet run against a real Docker daemon** — written and verified to
*compile*, but this session's environment had no Docker to actually execute
them. Expect roughly 10 additional tests (`Tests run: 110` total) covering:
an order row inserted and retrievable, an unfilled order's null
`executedPrice` round-tripping cleanly, a duplicate idempotency key
surfacing as a real constraint violation rather than being swallowed, the
optimistic-lock and cancel mappers reporting the correct affected row count
in both the success and the zero-rows-affected case, and positions read
back correctly (including a fully-closed position not being returned).
**This is the first real run of these — report back exactly what happens,**
success or failure.

## 7. Docker: build and run the service itself

```bash
docker compose --profile platform up -d --build
```

Builds `trade_api/Dockerfile` (multi-stage: Maven+JDK to build the jar, then
a bare JRE Alpine image to run it, as a non-root user) and starts it,
reading `POSTGRES_*`/`JWT_SECRET` from `.env` — same requirement as step 5:
those must point at a Postgres this container can actually reach, which
`localhost` inside the container is not. See the comments in
`docker-compose.yml` for `host.docker.internal` vs. joining an existing
Postgres container's network.

```bash
docker compose ps
```

**Expect**: `trade-api` shows `healthy` (its `HEALTHCHECK` polls
`/actuator/health`, which itself only reports `UP` once the database is
reachable and this module's Liquibase changelog has applied cleanly — so
"healthy" here means the whole stack actually works, not just that the JVM
started).

Then repeat the step 4 `curl` checks against `localhost:8080`.

Troubleshooting:

```bash
docker compose logs -f trade-api
```

Tear down:

```bash
docker compose --profile platform down
```

**Not yet run** — same caveat as step 6, no Docker daemon in the environment
that wrote this. Verified: every base image tag pinned
(`maven:3.9.9-eclipse-temurin-21-alpine`, `eclipse-temurin:21-jre-alpine`)
is real, checked against Docker Hub directly; the compose YAML parses
correctly. Not verified: that the image actually builds, or that the
container actually reaches your Postgres and comes up healthy.

## 8. Smoke-testing the six endpoints and the error catalogue

Once something from step 5 or 7 is running, this is what Sprint 6 is
actually assessed on. Using a token from step 4 (adjust `accountId` in the
token to match whichever seeded account you're addressing — `1` and `2` both
exist after step 2's seed data):

| Check | Request |
|---|---|
| Place an order | `POST /api/v1/orders` with a `PlaceOrderRequest` body |
| Cancel an order | `DELETE /api/v1/orders/{id}` (the UUID, no `ORD-` prefix) |
| Get account | `GET /api/v1/accounts/{id}` |
| Get balance | `GET /api/v1/accounts/{id}/balance` |
| Get positions | `GET /api/v1/accounts/{id}/positions` |
| Get order history | `GET /api/v1/accounts/{id}/orders` |

And each catalogue code, by constructing the request that should trigger it
(see `contracts/trade-api.yaml`'s business-rules table for exactly which
input triggers which): `ACC-404`, `ACC-403` (both an inactive account *and*
a token/account mismatch — same body either way), `INS-404`, `ORD-400`,
`ORD-409` (three different causes: duplicate idempotency key, insufficient
holdings, order not cancellable), `VAL-422`, `AUTH-401`.

## If something fails

Paste the actual error — the real stack trace or the real HTTP response
body, not a paraphrase of it. Every one of the four real bugs fixed in this
project (two Mockito primitive-matcher issues, a `@WebMvcTest`/`@MapperScan`
context-loading failure, a MyBatis null-parameter binding issue, a
too-short `JWT_SECRET` producing a buried `WeakKeyException` — all detailed
in `CLAUDE.md`) was found this way, and none of them would have
been found by re-reading the source code harder.
