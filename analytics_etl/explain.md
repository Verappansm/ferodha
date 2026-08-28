# What was done, and why

This covers the reasoning behind the changes, not just the file list. Read
`claims.md` for the claims themselves and the numbers behind them.

## Starting state

The pipeline existed (`extract.py`, `transform.py`, `load.py`, `main.py`)
and real cached candle data was already sitting in `data/cache/`, but three
things were broken or missing before any of this sprint's requirements could
be met:

- **It only ran by accident.** `extract.py` and `load.py` did `from config
  import ...` -- a bare, non-package import that only resolved because
  `config.py` happened to sit next to them and `python -m` was run from
  inside `analytics_etl/`. There was no `pyproject.toml`, so `pip install -e`
  (an explicit requirement) didn't work at all.
- **The transform caught 3 of 6 documented defects.** Missing fields, wrong
  types, and high-below-low were handled. Negative volume, non-ISO dates,
  and conflicting duplicate rows were not -- see "Transform fixes" below.
- **No tests, no dashboard.** Neither existed yet.

## Transform fixes

`etl_pipeline/transform/transform.py` was rewritten against the six defects
listed in `tests/fixtures/README.md`, using `candles-malformed.json` as the
source of truth for what "malformed" actually looks like in this API's
envelope. Each defect and what happens to it now:

| # | Defect | Handling |
|---|---|---|
| 1 | Same date twice, different closes | **New.** Both rows dropped ("quarantined") -- there's no way to know which close is real, so keeping either one is a guess. An exact repeat (every column identical) is left alone and collapses to one row later; that's not a conflict. |
| 2 | Missing `close` field | Already worked: schema check drops it. |
| 3 | String (`"n/a"`) where a number belongs | Already worked: `isinstance` check on required numeric fields drops it. |
| 4 | High below low | Already worked: OHLC sanity check drops it. |
| 5 | Negative volume | **New.** `filter_quality` now drops `volume < 0`. Zero volume is *kept* -- it shows up for real on thin sessions in the live cache and isn't a defect. |
| 6 | Non-ISO date (`09/07/2026`) | **New.** Previously the date was only checked for being a `str`, then handed to `pandas.to_datetime`, which will silently guess a format for an ambiguous string like that -- wrong on ~half of such inputs. Now there's an explicit `^\d{4}-\d{2}-\d{2}$` check before parsing; anything else is dropped, not guessed at. |

Two more things were added, not asked for by the defect list but by the
sprint README's line that transform should be "parsing, typing, cleaning,
aggregating, deriving":

- `daily_return`: close-to-close percentage change, computed per symbol.
  `NaN` on each symbol's first cached day, because there is no prior close
  -- that's a fact about the series, left visible rather than filled in.
- `trade_value`: `close * volume`, a turnover proxy. There's no per-trade
  data in a daily candle, so this stands in for "how much moved" on a given
  day. Both feed the dashboard directly instead of every consumer of the
  DuckDB table having to recompute them.
- A defensive extra, not in the original six: `bool` is a subclass of `int`
  in Python, so `"open": true` would otherwise pass a numeric-type check.
  It's now explicitly excluded (`test_rejects_boolean_disguised_as_price`).

On the real cached data (not the test fixtures), this drops 68 of 1596 raw
candles across all seven symbols -- all `synthetic: true` or null/negative
volume. No bad schema or OHLC inconsistency turned up in the live cache.
That number is checked in `claims.md`, not just asserted.

## Packaging restructure

To satisfy "`pip install -e sprint-04-analytics-etl` works from a machine
that has never seen your code" and "importable callables in three distinct
modules," `analytics_etl/` became a real installable package:

- `config.py` moved into `etl_pipeline/` and now reads `FAUXNANCE_API_URL`
  and `FAUXNANCE_API_KEY` from the environment via `python-dotenv`, with no
  hardcoded default -- I don't have your real Fauxnance base URL, so I
  didn't invent one. `.env.example` at the repository root documents what's
  needed; `.env` stays git-ignored.
- Every bare `from config import ...` became `from etl_pipeline.config
  import ...`.
- `pyproject.toml` declares the package, the `dev` extra (pytest), and two
  console scripts: `analytics-etl` (the pipeline) and
  `analytics-etl-dashboard` (the report builder). Both were tested from a
  clean `pip install -e '.[dev]'` in a fresh venv, not just imported in
  place.
- `load.py`'s `CREATE TABLE` gained `daily_return` and `trade_value`
  columns to match the new transform output.
- Misplaced files were moved to where they read correctly: the old
  `test_db.py` (a manual DB viewer with no test assertions -- pytest would
  have collected it as a test file with zero tests, which is misleading)
  is now `scripts/inspect_db.py`. `requiremnets.txt` (a typo'd filename,
  and now redundant with `pyproject.toml`'s dependency list) was removed.
- `scripts/rebuild_from_cache.py` is new: it rebuilds the DuckDB store
  straight from whatever's in `data/cache/`, with **no network call and no
  API key**, by reading the cached JSON directly rather than going through
  `extract_all()`'s cache-freshness check. Useful after a transform change,
  or for a teammate who has the repo's cache but not a key yet. This is
  what regenerated `data/data.duckdb` after the schema change above --
  it's a derived artifact, rebuilt from the cache that was already
  committed, not hand-authored data.

### On `__init__.py`: not needed, removed

I added empty `__init__.py` files to every `etl_pipeline` subpackage out of
habit -- it's the traditional way to mark a directory as a Python package.
You were right to question it. I tested it directly: with every
`__init__.py` deleted, a **fresh** `pip uninstall` + `pip install -e
'.[dev]'` and the full test suite (14/14) both still pass, because modern
Python (3.3+) treats a directory with no `__init__.py` as an implicit
*namespace package* and resolves imports through it exactly the same way.
Given nothing here relies on classic-package-only behaviour (no
`pkgutil`-style plugin discovery, no relative-import tricks that need an
explicit package boundary), the file was pure boilerplate with no effect.
They're gone.

### On `__pycache__`: never needed in git, now actually excluded

`__pycache__/*.pyc` are compiled-bytecode caches Python regenerates
automatically on every run from the `.py` source -- committing them is
never correct, they're pure clutter and can even go stale relative to the
source they were compiled from. They were already sitting in the initial
commit (`analytics_etl/__pycache__/*.cpython-314.pyc` and similar under
`etl_pipeline/*/`). `.gitignore` only listed `.env` before this pass, so
nothing was stopping them from being tracked, and my first attempt at
`git rm --cached` used a glob that partially didn't match and aborted the
whole command silently -- so they were still tracked. Fixed properly this
time: `.gitignore` now excludes `__pycache__/`, `*.pyc`, `*.egg-info/`,
`.pytest_cache/`, and `.venv/` (the local virtualenv used to build and test
all of this -- also never belongs in git); every currently-tracked
`__pycache__` file was untracked individually (`git ls-files | grep -i
pycache | xargs git rm --cached`); and all `__pycache__` directories were
deleted from disk. They'll reappear the moment you run Python again --
that's expected and harmless, `.gitignore` now keeps them out of `git
status` and out of any future commit.

## Tests

`tests/test_transform.py`, 14 tests, no network, no DuckDB:

- One per documented defect, each built from a minimal hand-written payload
  so the assertion is unambiguous about which rule fired --
  `test_rejects_a_high_below_a_low`, `test_rejects_negative_volume`,
  `test_rejects_non_iso_date`, `test_rejects_non_numeric_price_string`,
  `test_rejects_row_missing_close`,
  `test_quarantines_duplicate_date_with_conflicting_close`.
- Two extra defensive cases beyond the six:
  `test_keeps_exact_duplicate_row_once` (proves the quarantine logic isn't
  over-eager) and `test_rejects_boolean_disguised_as_price`.
- `test_derives_daily_return_and_trade_value` and
  `test_transform_returns_empty_dataframe_for_no_payloads` cover the
  deriving step and the empty-input edge case.
- Four integration tests read the actual fixture files from
  `tests/fixtures/` (pulled verbatim from the sprint repo, byte-identical --
  checked with `diff`) and run them through the real `transform()`:
  `test_reliance_fixture_preserves_calendar_gap` (the fixture has a missing
  weekday -- the transform must not invent it),
  `test_infy_fixture_drops_null_volume_and_synthetic_rows`,
  `test_malformed_fixture_yields_no_valid_rows` (every one of the six
  defects lands on a different one of that fixture's seven rows, so
  nothing survives -- and transform must not raise), and
  `test_multiple_symbols_together_stay_independent`.

## Dashboard and claims

`etl_pipeline/dashboard/build_report.py` reads only from the DuckDB store
the pipeline already loaded (no network, no key) and writes
`analytics_etl/report.html`: three plotly charts, one per claim, with
plotly's JS inlined once so the file opens in a browser with no network and
no build step. Each claim's number was computed from the real cached
candle data with a DuckDB query, then cross-checked with an independent
pandas computation before being written into the page -- not typed in by
hand.

The claim about client exposure (Reliance vs. TCS) was dropped and
replaced, at your call, because that data doesn't exist yet: the
platform's own trades arrive in Sprint 6/7, and until then there's only
Fauxnance market candles, no client positions. Claim 2 became a sector
turnover claim instead (banking vs. IT combined traded value) -- same
underlying idea (concentration), backed by four real symbols instead of an
invented position. Full reasoning, including the specific numbers, is in
`claims.md`'s Notes section, along with why Adani Enterprises was picked
for claim 3 (highest realized volatility of the seven symbols, measured,
not guessed) and why Tata Steel wasn't usable for that claim (its cache
only covers 27 sessions vs. roughly a year for the rest).

## Running it

```bash
cd analytics_etl
pip install -e '.[dev]'
pytest                                          # 14 tests, no network
python -m etl_pipeline.pipeline.main            # extract (cache-first) -> transform -> load
python -m etl_pipeline.dashboard.build_report   # writes report.html
python scripts/rebuild_from_cache.py            # rebuild DuckDB from data/cache/, no network at all
```
