from __future__ import annotations

import pathlib

import duckdb

from etl.config import DuckDBConfig

_MIGRATIONS_DIR = pathlib.Path(__file__).resolve().parents[2] / "migrations"


def connect(cfg: DuckDBConfig) -> duckdb.DuckDBPyConnection:
    return duckdb.connect(cfg.path)


def run_migrations(con: duckdb.DuckDBPyConnection) -> None:

    for path in sorted(_MIGRATIONS_DIR.glob("*.sql")):
        sql = path.read_text()
        con.execute(sql)
