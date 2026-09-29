# analytics_etl

Sprint 4: Fauxnance daily candles, extracted, transformed and loaded into a
DuckDB star schema, and the dashboard (`report.html`) built from it.

```bash
pip install -e '.[dev]'
python -m etl_pipeline.pipeline.main           # extract (cache-first) -> transform -> load
python -m etl_pipeline.dashboard.build_report  # writes report.html
pytest
```

`FAUXNANCE_API_URL` and `FAUXNANCE_API_KEY` come from the environment.
`scripts/rebuild_from_cache.py` rebuilds the store from `data/cache/` with no
network call.

## Where the design lives

Sprint 4 asked for three business claims, each naming the chart that supports
it. They are in `design/analytics-claims.md`.
