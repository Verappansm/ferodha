# etl

The ETL layer: two pipelines in one Python project, writing one DuckDB
warehouse, `database/duckdb/analytics.duckdb` (generated, git-ignored; schema in
`database/duckdb/migrations/`).

| Pipeline | Package | Sprint | Source | Tables |
|---|---|---|---|---|
| Market data | `etl_pipeline` | 4 | Fauxnance daily candles | `real_market_data` |
| Trades | `etl` | 7 | Postgres orders and trades | `dim_account`, `dim_instrument`, `dim_date`, `fact_trades`, `dead_letter_rows`, `etl_watermark` |

```bash
cd etl
pip install -e '.[dev]'
pytest                                          # both pipelines' tests

python -m etl_pipeline.pipeline.main            # candles: extract (cache-first) -> transform -> load
python -m etl_pipeline.dashboard.build_report   # writes report.html (the Sprint 4 claims dashboard)
python scripts/rebuild_from_cache.py            # candles from data/cache/, no network call

python -m etl.cli run-all                       # trades: dimensions, then one batch of facts

python scripts/inspect_market_data.py           # look at either side of the warehouse
python scripts/inspect_fact_trades.py
```

Configuration comes from the environment (a repository-root `.env` is read):

| Variable | Used by | Default |
|---|---|---|
| `FAUXNANCE_API_URL`, `FAUXNANCE_API_KEY` | candles | none: the cache in `data/cache/` is used |
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | trades | host `localhost`, port `5432` |
| `DUCKDB_PATH` | both | `database/duckdb/analytics.duckdb` |
| `DUCKDB_MIGRATIONS_DIR` | both | `database/duckdb/migrations` |

The Sprint 4 claims and the charts behind them: `contracts/docs/analytics-claims.md`.
The FACT_TRADES design: `fact-trades-etl.md`.
