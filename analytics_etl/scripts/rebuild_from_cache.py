"""Rebuild the analytical store from whatever is already in data/cache/,
with no network call and no API key needed.

extract_all() would also do this (it reads cache first), but it still
requires FAUXNANCE_API_URL/KEY to be set in case a symbol's cache is stale.
This script only ever reads what's on disk -- useful for a teammate who has
the repo's cache but not a key yet, and for regenerating the store after a
transform change. Run from analytics_etl/:

    python scripts/rebuild_from_cache.py
"""

import json

from etl_pipeline.config import CACHE_DIR, DB_PATH, TABLE_NAME
from etl_pipeline.transform.transform import transform
from etl_pipeline.load.load import load

import duckdb


def main():
    payloads = [json.loads(p.read_text()) for p in sorted(CACHE_DIR.glob("*.json"))]
    if not payloads:
        print(f"[rebuild] no cached payloads found in {CACHE_DIR}")
        return

    duckdb.connect(DB_PATH).execute(f"DROP TABLE IF EXISTS {TABLE_NAME}").close()

    df = transform(payloads)
    print(f"[rebuild] {len(df)} clean rows from {len(payloads)} cached symbol payload(s)")
    load(df)


if __name__ == "__main__":
    main()
