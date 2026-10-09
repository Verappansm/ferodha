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

One set of host ports, the same under Docker and on the Windows profile, and
the ones Neueda's contracts and `infra/README.md` use.

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
