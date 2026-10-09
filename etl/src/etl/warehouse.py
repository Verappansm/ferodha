"""Where the DuckDB analytics warehouse and its schema live.

Both pipelines in this project (the Sprint 4 candle load, etl_pipeline, and the
Sprint 7 FACT_TRADES load, etl) write one DuckDB file, kept with the other
databases under database/duckdb/. Its schema is the numbered .sql files in
database/duckdb/migrations/, applied in name order; each is idempotent.

DUCKDB_PATH and DUCKDB_MIGRATIONS_DIR override the defaults (Docker, tests).
"""

from __future__ import annotations

import os
from pathlib import Path

# etl/src/etl/warehouse.py -> repository root
REPO_ROOT = Path(__file__).resolve().parents[3]

DEFAULT_DUCKDB_PATH = REPO_ROOT / "database" / "duckdb" / "analytics.duckdb"
DEFAULT_MIGRATIONS_DIR = REPO_ROOT / "database" / "duckdb" / "migrations"


def duckdb_path() -> str:
    path = Path(os.environ.get("DUCKDB_PATH", DEFAULT_DUCKDB_PATH))
    path.parent.mkdir(parents=True, exist_ok=True)
    return str(path)


def migrations_dir() -> Path:
    return Path(os.environ.get("DUCKDB_MIGRATIONS_DIR", DEFAULT_MIGRATIONS_DIR))
