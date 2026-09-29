# Claims

| # | Claim | Chart artefact |
|---|---|---|
| 1 | HDFC Bank and ICICI Bank closed in the same direction (both up or both down) on 69.5% of trading days (173 of 249) between 2025-08-29 and 2026-08-26. | analytics_etl/report.html#hdfc-icici-sync |
| 2 | Combined traded value in HDFC Bank and ICICI Bank (₹10.96 trillion) exceeded combined traded value in Infosys and TCS (₹6.08 trillion) by 80% between 2025-08-28 and 2026-08-26. | analytics_etl/report.html#sector-turnover |
| 3 | Adani Enterprises' average daily traded value rose 57%, from ₹321.2 crore/day (Aug–Dec 2025) to ₹502.7 crore/day (Jan–Jun 2026), alongside a rise in realized daily volatility from 1.63% to 2.62%. | analytics_etl/report.html#adanient-trade-size |

## Notes

**Symbols in scope.** Seven names, all NSE or BSE: `INFY.NS`, `RELIANCE.NS`,
`TATASTEEL.BO`, `TCS.NS`, `ICICIBANK.NS`, `HDFCBANK.NS`, `ADANIENT.NS`. All
seven satisfy criterion 6 on their own; claims 1 and 2 use the four bank/IT
names, claim 3 uses Adani Enterprises.

**Date range pulled.** Daily candles from 2025-08-28 to 2026-08-27, cached
per symbol in `analytics_etl/data/cache/`. `TATASTEEL.BO`'s cache only covers 2026-07-17
to 2026-08-26 (27 sessions) -- noticeably shorter than the other six, which
each have roughly a full year. That is why claim 3 uses Adani Enterprises
rather than Tata Steel: a volatility comparison across two six-month windows
needs both windows to exist in the data, and Tata Steel doesn't have the
earlier one.

**Why Adani Enterprises for claim 3.** "A volatile stock" wasn't picked by
eye. Realized daily volatility (standard deviation of daily returns) was
computed for all seven symbols over their full cached history; Adani
Enterprises came out highest at 2.15%, against 1.19%-1.88% for the rest of
the NSE names. The claim then compares its own average daily traded value
across two six-month windows (Aug-Dec 2025 vs Jan-Jun 2026), not a
comparison against another stock.

**What the transform rejected, and why.** `etl_pipeline/transform/transform.py`
runs schema/type validation (including a strict `YYYY-MM-DD` date check),
a quality filter (drops `synthetic` candles, null volume, negative volume),
duplicate resolution, and OHLC sanity checking, in that order -- see the
module docstring and `tests/test_transform.py` for the full defect-by-defect
behaviour. On the real cached data (not the fixtures), 68 of 1596 raw
candles across all seven symbols were dropped, all for `synthetic: true` or
null/negative volume -- no OHLC inconsistencies or bad schema turned up in
the live cache, which lines up with Fauxnance's own documentation that those
are the two failure modes it actually emits. Two derived columns are added
after cleaning: `daily_return` (close-to-close, per symbol, NaN on each
symbol's first day) and `trade_value` (`close * volume`, a turnover proxy --
there is no per-trade data available yet, so "trade size" in claim 3 means
average traded value per session, not size per individual trade).

**A claim I did not make.** The original intent for claim 2 was
"client exposure to Reliance Industries vs. TCS." That data does not exist:
the platform's own Trade REST API and Trade Executor land in Sprint 6/7, so
there are no client positions to measure yet, only Fauxnance market candles.
Turning that into a market-turnover claim about Reliance vs. TCS specifically
would have been a thin single-pair comparison; the sector-level version
(claim 2, above) uses the same underlying idea -- concentration -- but is
backed by four symbols instead of two and states plainly that "traded value"
is standing in for "exposure" until real trade data exists.

## Running the pipeline

From `analytics_etl/`, after `pip install -e '.[dev]'` (see the repository
root's `.env.example` for the two environment variables the extract step
needs):

```bash
python -m etl_pipeline.pipeline.main          # extract (cache-first) -> transform -> load
python -m etl_pipeline.dashboard.build_report  # reads the DuckDB store, writes report.html
pytest                                         # tests/test_transform.py, no network required
```

`analytics_etl/scripts/rebuild_from_cache.py` rebuilds the DuckDB store straight from
whatever is already in `analytics_etl/data/cache/`, with no network call and no API key --
useful after a transform change, or for a teammate who has the repo's cache
but not a key yet.
