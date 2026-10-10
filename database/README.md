# database

The platform's two databases: PostgreSQL (operational, `tradedb`) and DuckDB
(analytics).

```
database/
├── migrations/001_initial_schema.sql   Sprint 3 base schema (PostgreSQL)
├── seeds/001_seed_data.sql             Sprint 3 seed data
├── reset.sql                           drops everything in tradedb
├── apply.sh                            empty database -> migrated and seeded (no-op if already there)
├── scripts/check.sh, probes/           integrity checks (orphan foreign keys, duplicate idempotency keys)
└── duckdb/
    ├── migrations/                     analytics warehouse schema (DuckDB)
    └── analytics.duckdb                the warehouse (generated, git-ignored)
```

Every seeded user's password is `seed-password-change-me`; every seeded and demo
bank account's PIN is `1234`.

## PostgreSQL

Three owners build the schema, always in this order:

| Order | Owner | What it creates | When it runs |
|---|---|---|---|
| 1 | `migrations/001_initial_schema.sql`, `seeds/001_seed_data.sql` | The Sprint 3 tables, types and seed rows | Docker Compose on a fresh volume (`docker-entrypoint-initdb.d`), `windows/start-windows.ps1` on an empty database, or `apply.sh` |
| 2 | trade-api, Liquibase (`trade_api/src/main/resources/db/changelog/`) | Every schema change after Sprint 3 (below) | Each trade-api start; applied changesets are recorded in `DATABASECHANGELOG` and never rerun |
| 3 | auth-service (`auth_service/src/persistence/schema.ts`) | `auth_refresh_tokens`, `auth_email_otps`, `Users.email_verified_at` | Each auth-service start, idempotently |

The Sprint 3 files are never edited for a later change: a change is a new
Liquibase changeset, so an existing database and a fresh one end up identical.

### Changes made by Liquibase

| Changeset | Change |
|---|---|
| 001 | `Accounts`: status, version (optimistic locking), last-updated, numeric `id` and `business_ref` |
| 002 | `Orders`: status values aligned with the contract (NEW, FILLED, REJECTED, CANCELLED) |
| 003 | `Instruments.tradable`: delisting is a flag, so order history keeps its rows |
| 004 | `Orders`: executor settlement columns (rejection reason, executed at and price) |
| 005 | `Orders`: PARTIALLY_FILLED, order source and remaining quantity (order book matching) |
| 006 | The market maker's user, bank and account rows, with its seed liquidity (market-sim) |
| 007 | `Orders.published_at`: when Kafka acknowledged ORDER_PLACED, so unpublished orders are re-sent |
| 008 | `account_requests`: account-opening requests awaiting admin approval |
| 009 | Admin console: `admin_audit`, instrument and user change tracking, request decisions |
| 010 | `market_candles`: daily OHLC history (replaces the Sprint 3 `Market_Data`) |
| 011 | `market_bars`: one-minute bars for the intraday chart |
| 012 | Seed passwords re-hashed for the browser-side password digest |
| 013 | More tradable instruments |
| 014 | `Orders.fee_rate`: the commission rate charged at review is the rate charged at fill |
| 015 | `strategies`, `strategy_events`, `Orders.strategy_id`: automated strategies |
| 016 | `notifications`; `strategies.last_checked_at` |
| 017 | `pref_customer_preference`: customer preferences |
| 018 | Notifications tables rebuilt; price alerts on watchlist items |
| 019 | Bank transfer idempotency key; Indian (NSE) instruments; watchlist display order |
| 020 | Demo bank PIN verifiers; Sprint 3 notifications kept as `legacy_notifications` |
| 021 | Bank account linking by verified email (one bank account per user and per account) |
| 022 | Price alerts and notification channel unified into the notifications module |
| 023 | `notifications.read_at`; legacy notifications migrated into the module |
| 024 | Bank account currency, alert state, instrument search indexes (`pg_trgm`) |
| 025 | Unlinked demo bank accounts, so new sign-ups can be approved |

Each changeset file opens with the reason for it.

### Reset

`reset.sql` drops every object in `tradedb` (tables, types, Liquibase history,
auth tables) and recreates an empty `public` schema. Stop the three services,
run it, apply the Sprint 3 files, then start trade-api and auth-service:

```bash
psql -h localhost -U trade -d tradedb -v ON_ERROR_STOP=1 -f database/reset.sql
./database/apply.sh
```

Under Docker, `docker compose down -v` resets PostgreSQL and Kafka together.

## DuckDB (analytics)

One warehouse file, `duckdb/analytics.duckdb`, written by both pipelines of the
ETL layer (`etl/`). Its schema is `duckdb/migrations/*.sql`, applied in name
order by every load; each file is idempotent.

| File | Tables | Written by |
|---|---|---|
| `0001_fact_trades_schema.sql` | `dim_account`, `dim_instrument`, `dim_date`, `fact_trades`, `dead_letter_rows`, `etl_watermark` | `python -m etl.cli run-all` (from PostgreSQL) |
| `0002_market_data_schema.sql` | `real_market_data` | `python -m etl_pipeline.pipeline.main` (from Fauxnance) |

The file is generated and never committed; rebuild it with the commands in
`etl/README.md`. `DUCKDB_PATH` points the pipelines at another file.

## Where the design lives

The Sprint 3 ER diagram, index justifications and normalisation notes are in
`contracts/docs/`.
