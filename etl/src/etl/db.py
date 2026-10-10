from __future__ import annotations

import duckdb

from etl.config import DuckDBConfig
from etl.warehouse import migrations_dir


def connect(cfg: DuckDBConfig) -> duckdb.DuckDBPyConnection:
    return duckdb.connect(cfg.path)


def run_migrations(con: duckdb.DuckDBPyConnection) -> None:
    """Applies every database/duckdb/migrations/*.sql in name order (all idempotent)."""
    folder = migrations_dir()
    scripts = sorted(folder.glob("*.sql"), key=lambda f: f.name)
    if not scripts:
        raise RuntimeError(f"No migration .sql files found in {folder}")
    for script in scripts:
        con.execute(script.read_text(encoding="utf-8"))
