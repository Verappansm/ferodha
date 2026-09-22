# etl — One Incremental Load into FACT_TRADES

## Setup

```bash
cd fact_trades_etl
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
.venv/bin/python -m pytest tests
```

## Environment

Copy these into `.env` (never commit real credentials):

```
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=
POSTGRES_USER=
POSTGRES_PASSWORD=
DUCKDB_PATH=/path/to/the/SAME/warehouse.duckdb/from/sprint4   # do not point this at a new file
```

`*.duckdb` files are gitignored repo-wide — they're generated output, not source, the same way
nobody commits a populated Postgres data directory. `analytics_etl/etl_pipeline/config.py`
hardcodes Sprint 4's own warehouse at `analytics_etl/data/data.duckdb` (no README there yet to
point at instead); set `DUCKDB_PATH` to that same file's path if you want this pipeline's
`load-dims`/`load-facts` writing into the actual shared warehouse rather than a throwaway local
one. Either way, run the load commands below yourself — nothing ships a pre-built `.duckdb`.

## The three pipeline commands

Each runs independently — a teammate can run just one stage:

```bash
# 1. Dimensions: dim_date (10-year range), dim_instrument (Type 1), dim_account (Type 2)
python -m etl.cli load-dims

# 2. One incremental batch into fact_trades, watermarked on orders.placed_at
python -m etl.cli load-facts

# 3. Both, in the correct order
python -m etl.cli run-all
```

`load-dims` is idempotent to re-run any time (widen `--num-years` if the range needs
extending). `load-facts` is idempotent per the contract: it merges on
`source_order_id` (delete-then-insert in one transaction), so re-running over a
window that already loaded adds zero rows.

## What's dead-lettered, and why

Every row failing a check lands in `dead_letter_rows` with a `batch_id`, the
`source_order_id` (when known), a machine-readable `reason`, and the raw row as
JSON — never dropped, never patched with a placeholder dimension row. Reasons
currently produced: `UNRESOLVED_ACCOUNT_KEY`, `UNRESOLVED_INSTRUMENT_KEY`,
`UNRESOLVED_DATE_KEY`, `INVALID_SIDE:*`, `INVALID_STATUS:*`, `MISSING_QUANTITY`,
`UNPARSEABLE_QUANTITY`, `NON_POSITIVE_QUANTITY`, `MISSING_PRICE`,
`UNPARSEABLE_PRICE`, `NON_POSITIVE_PRICE`, `MISSING_PLACED_AT`.
