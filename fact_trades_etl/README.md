# fact_trades_etl

Sprint 7: one incremental batch load of orders from Postgres into the DuckDB
`FACT_TRADES` star schema and its dimensions.

```bash
pip install -e '.[dev]'
pytest tests
python -m etl.cli run-all       # dimensions, then one batch of facts
```
