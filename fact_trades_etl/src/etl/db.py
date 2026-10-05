from __future__ import annotations

from importlib import resources

import duckdb

from etl.config import DuckDBConfig

# Shipped inside the package (see package-data in pyproject.toml) so the
# SQL is found whether etl is installed editable, normally, or in Docker.
_MIGRATIONS = resources.files("etl") / "migrations"


def connect(cfg: DuckDBConfig) -> duckdb.DuckDBPyConnection:
    return duckdb.connect(cfg.path)


def run_migrations(con: duckdb.DuckDBPyConnection) -> None:
    scripts = sorted(
        (f for f in _MIGRATIONS.iterdir() if f.name.endswith(".sql")),
        key=lambda f: f.name,
    )
    if not scripts:
        raise RuntimeError(f"No migration .sql files found in {_MIGRATIONS}")
    for script in scripts:
        con.execute(script.read_text(encoding="utf-8"))
