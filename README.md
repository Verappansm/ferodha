# chennai-capstone-SE4-team2

Full-stack enterprise trading platform. Team 2's capstone build.

## Layout

- `trade_api/` — Trade REST API (Java, Spring Boot). Places and cancels orders, account reads.
- `trade_executor/` — Trade Executor (Java, Spring Boot). Consumes orders from Kafka, prices them, settles, publishes fills/rejections.
- `java_module/` — Domain rules, frozen; copied into `trade_api` as source.
- `kafka_pipeline/` — Kafka topic and dead-letter-topic creation scripts.
- `database/` — Base Postgres schema, seed data, and integrity probes.
- `fact_trades_etl/` — Incremental batch load of orders into a DuckDB FACT_TRADES star schema.
- `analytics_etl/` — Fauxnance candle ingestion and the claims dashboard (separate pipeline).
- `design/` — Kafka topic/key/partition write-up, event envelope contract, and the trade-api OpenAPI contract.
- `docker-compose.yml` — brings up Postgres, Kafka, and both services.

## Running it

```bash
cp .env.example .env   # fill in POSTGRES_*, JWT_SECRET, FAUXNANCE_API_URL, FAUXNANCE_API_KEY
./SB_AND_KAFKA_DEMO.sh
```

Brings up the stack, creates the Kafka topics, and walks through every endpoint.

## Development setup

Once per clone, install the repo's pre-commit hooks (secret scanning,
shellcheck, basic hygiene — see `extension_stories.md` and
`.pre-commit-config.yaml`):

```bash
pip install pre-commit
pre-commit install
```

They then run automatically on `git commit`. To run them on demand against
everything already in the repo:

```bash
pre-commit run --all-files
```
