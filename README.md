# chennai-capstone-SE4-team2

Full-stack enterprise trading platform. Team 2's capstone build.

## Layout

Each folder has a short README. Design write-ups are in `contracts/` (index:
`contracts/docs/README.md`); extension stories and contract departures are in
`story_docs/`.

- `trade_api/` — Trade REST API (Java, Spring Boot). Places and cancels orders, account reads.
- `trade_executor/` — Trade Executor (Java, Spring Boot). Consumes orders from Kafka, prices them at the live tick, settles, publishes fills/rejections. Also runs the platform's price feed (`com.trade.executor.ticker`) and, under `market-sim`, the market maker (`com.trade.executor.marketmaker`).
- `auth_service/` — Auth service (NestJS). Register, login, refresh, `/auth/me`; issues the JWTs trade_api verifies.
- `trading-ui/` — Trading UI (Angular 21). Sign-in, order ticket and order blotter, over clients generated from the contracts.
- `java_module/` — Domain rules, frozen; copied into `trade_api` as source.
- `database/` — Base Postgres schema, seed data, and integrity probes.
- `kafka_pipeline/` — Kafka topic and dead-letter-topic creation scripts.
- `etl/` — The ETL layer: Fauxnance candles and the claims dashboard (Sprint 4), and the incremental FACT_TRADES load (Sprint 7), into one DuckDB warehouse under `database/duckdb/`.
- `contracts/` — Contracts as implemented and design write-ups.
- `story_docs/` — Extension stories (LEAP-001 onwards) and every departure from the Neueda contracts.
- `bruno/` — Bruno collection exercising the auth service end to end.
- `scripts/` — Demo scripts and the JWT test-token generator.
- `windows/` — Split setup: services native on Windows, Kafka in Docker on Linux.
- `docker-compose.yml` — brings up Postgres, Kafka and every service.

## Running it

```bash
cp .env.example .env   # fill in POSTGRES_*, JWT_SECRET, FAUXNANCE_API_URL, FAUXNANCE_API_KEY
./scripts/demo.sh          # add --fresh to start from an empty database
```

Brings up the stack, creates the Kafka topics, starts the trading UI on
http://localhost:4200 and the admin console on http://localhost:4200/admin, then walks the auth service and every trade-api
endpoint with real tokens from the auth service, and ends with a tour of the
UI. It works with either `docker compose` or the older `docker-compose`.
`--no-ui` skips both UIs; `./scripts/demo.sh --stop-ui` stops them. The UIs need
Node 20.19+, 22.12+ or 24+ on the host.

Without Docker on Windows (Kafka on a Linux machine), see
`windows/windows-setup.md`; `windows/start-windows.ps1` starts both services, the
auth service and both UIs (`-MarketSim` for the simulated market).

Two Spring Boot services: trade-api and trade-executor. The executor also
runs the live price feed under both profiles (`market-data` ticks, the
instrument page's charts), and fills are priced at that tick.
`SPRING_PROFILES_ACTIVE=market-sim` only changes how it settles orders: on an
order book at those prices, with its market maker's synthetic counter-orders,
instead of fill-or-reject at the tick.

Sign in at http://localhost:4200 as `john.carter@example.com` with the
password `seed-password-change-me`. A user who registers has no account until
an administrator approves it, so only seeded users can sign in for now.
Administrators sign in to the console at http://localhost:4200/admin as
`michael.brown@example.com` with the same password.

## Ports

One set of host ports, the same under Docker and on the Windows profile. They
follow Neueda's `infra/README.md`, except the Trade REST API, which the
deployment brief moves to 8081 (`story_docs/contract-breach.md`, B38).

| Service | Port |
|---|---|
| PostgreSQL | 5432 |
| Kafka | 9092 |
| Kafka UI | 8091 |
| Trade REST API | 8081 |
| Trade Executor | 8082 |
| Auth service | 3000 |
| Trading UI (`ng serve`) | 4200 |
| Admin console (`ng serve admin`) | 4200, under `/admin` (its dev server: 127.0.0.1:4300, not published) |

Docker publishes these ports on the host, so stop a native Postgres (or any
other process on one of them) before `docker compose up`.

## Configuration

Every service takes its configuration from environment variables at start-up.
The files in the repository hold only defaults and placeholders; no secret is
committed.

### Where configuration is defined

| Component | Runtime | Definition | Profiles and variants |
|---|---|---|---|
| Trade REST API | Spring Boot | `trade_api/src/main/resources/application.yml` | `application-windows.yml` |
| Trade Executor | Spring Boot | `trade_executor/src/main/resources/application.yml` | `application-windows.yml`, `application-market-sim.yml` |
| Auth service | NestJS | `auth_service/src/config/validation.schema.ts` (variables, defaults, validation); `config.service.ts` (typed access) | none |
| Trading UI, admin console | Angular | `trading-ui/src/environments/environment.ts`, `trading-ui/projects/admin/src/environments/environment.ts`; `trading-ui/angular.json`; `trading-ui/proxy.conf.json` | none |
| ETL layer | Python | `etl/src/etl/warehouse.py`, `etl/src/etl/config.py`, `etl/src/etl_pipeline/config.py` | none |

Each runtime uses its native mechanism. The two Spring services declare every
setting in `application.yml` as `${VARIABLE:default}`, so the same artefact runs
locally, under Docker and on EC2 without a rebuild. The auth service validates
its variables at start-up and refuses to start when a required one is missing.
The Angular applications run in the browser and cannot read server-side
configuration: they derive the API addresses from the host that served the
page, and the build fixes the admin console's base path (`/admin/`).

### Where values are supplied

| Environment | Source |
|---|---|
| Docker Compose (local or EC2) | `.env` at the repository root (copied from `.env.example`), passed to each container by `docker-compose.yml` |
| Windows profile | `windows/.env.windows` (copied from `windows/.env.windows.example`), loaded by `windows/start-windows.ps1` |
| A single service run directly | The shell environment; otherwise the defaults in its definition |

`.env` and `windows/.env.windows` are git-ignored.

### Variables

| Variable | Used by | Default | Notes |
|---|---|---|---|
| `POSTGRES_HOST`, `POSTGRES_PORT` | trade-api, trade-executor, auth-service, ETL | `localhost`, `5432` | `postgres:5432` inside Docker |
| `POSTGRES_DB`, `POSTGRES_USER` | as above | `tradedb`, `trade` (Docker) | |
| `POSTGRES_PASSWORD` | as above | `trade` (Docker only) | Secret |
| `KAFKA_BOOTSTRAP_SERVERS` | trade-api, trade-executor | `localhost:9092` | `kafka:29092` inside Docker; no default under the `windows` profile |
| `JWT_SECRET` | trade-api, auth-service | development value (Docker only) | Secret; at least 32 characters; identical in both services |
| `CORS_ALLOWED_ORIGINS` | trade-api, auth-service | `http://localhost:4200` | The browser origin of the UI; on EC2, `http://<public-host>:4200` |
| `FAUXNANCE_API_URL`, `FAUXNANCE_API_KEY` | trade-executor, ETL | none | Secret key; without it there are no live prices and orders are rejected |
| `SPRING_PROFILES_ACTIVE` | trade-executor | empty | `market-sim` for order-book matching and the market maker |
| `SERVER_PORT` | trade-api, trade-executor | `8081`, `8082` | |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | auth-service, trade-api | none | Secret password; with `SMTP_HOST` unset, no mail is sent and sign-up codes are written to the auth-service log (development only). |
| `DUCKDB_PATH` | ETL | `database/duckdb/analytics.duckdb` | |

### Deployment on EC2

1. Copy `.env.example` to `.env` and set `JWT_SECRET`, `POSTGRES_PASSWORD`,
   `FAUXNANCE_API_URL`, `FAUXNANCE_API_KEY` and
   `CORS_ALLOWED_ORIGINS=http://<public-host>:4200`. Set the `SMTP_*`
   variables too for real email (for Gmail: `smtp.gmail.com`, port 587 and an
   App Password); left empty, sign-up codes are written to the auth-service log.
2. `docker compose up -d --build` starts PostgreSQL, Kafka (with its topics,
   created by `kafka-init`), trade-api, trade-executor and auth-service.
3. In `trading-ui`, `npm ci`, then `npm run start:admin` and
   `npm run start:public`. The trading UI listens on all interfaces on 4200
   and serves the admin console at `/admin`; the console's own server listens
   on 127.0.0.1:4300 only.
4. Open inbound 4200 (UI), 8081 (Trade REST API) and 3000 (auth service) in
   the instance's security group: the browser calls both APIs directly. Keep
   5432, 9092, 8082 and 8091 closed.

## Development setup

Once per clone, install the repo's pre-commit hooks (secret scanning,
shellcheck, basic hygiene, ESLint/Prettier for `auth_service` — see `story_docs/extension-stories.md` and
`.pre-commit-config.yaml`):

```bash
pip install pre-commit
pre-commit install
(cd auth_service && npm ci)   # the auth_service ESLint hook uses its node_modules
```

They then run automatically on `git commit`. To run them on demand against
everything already in the repo:

```bash
pre-commit run --all-files
```
