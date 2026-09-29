# chennai-capstone-SE4-team2

Full-stack enterprise trading platform. Team 2's capstone build.

## Layout

Each folder has a short README. Design write-ups are in `design/` (index:
`design/README.md`); extension stories and contract departures are in
`story_docs/`.

- `trade_api/` — Trade REST API (Java, Spring Boot). Places and cancels orders, account reads.
- `trade_executor/` — Trade Executor (Java, Spring Boot). Consumes orders from Kafka, prices them, settles, publishes fills/rejections.
- `auth_service/` — Auth service (NestJS). Register, login, refresh, `/auth/me`; issues the JWTs trade_api verifies.
- `java_module/` — Domain rules, frozen; copied into `trade_api` as source.
- `database/` — Base Postgres schema, seed data, and integrity probes.
- `kafka_pipeline/` — Kafka topic and dead-letter-topic creation scripts.
- `fact_trades_etl/` — Incremental batch load of orders into a DuckDB FACT_TRADES star schema.
- `analytics_etl/` — Fauxnance candle ingestion and the claims dashboard (separate pipeline).
- `pricing_generator/` — Simulated market data for the `market-sim` profile.
- `trades_generator/` — Synthetic order liquidity for the `market-sim` profile.
- `design/` — Contracts as implemented and design write-ups.
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

Brings up the stack, creates the Kafka topics, then walks the auth service and
every trade-api endpoint with real tokens from the auth service. It works with
either `docker compose` or the older `docker-compose`.

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
