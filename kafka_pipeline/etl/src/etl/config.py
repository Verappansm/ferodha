
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class PostgresConfig:
    host: str
    port: int
    dbname: str
    user: str
    password: str

    @property
    def dsn(self) -> str:
        return (
            f"host={self.host} port={self.port} dbname={self.dbname} "
            f"user={self.user} password={self.password}"
        )

    @classmethod
    def from_env(cls) -> "PostgresConfig":
        return cls(
            host=os.environ.get("POSTGRES_HOST", "localhost"),
            port=int(os.environ.get("POSTGRES_PORT", "5432")),
            dbname=os.environ["POSTGRES_DB"],
            user=os.environ["POSTGRES_USER"],
            password=os.environ["POSTGRES_PASSWORD"],
        )


@dataclass(frozen=True)
class DuckDBConfig:
    # TODO: point this at your existing Sprint 4 .duckdb file, not a new one.
    path: str

    @classmethod
    def from_env(cls) -> "DuckDBConfig":
        return cls(path=os.environ.get("DUCKDB_PATH", "analytics.duckdb"))


PIPELINE_NAME = "fact_trades_incremental"

# Confirmed against trade_api's 002-order-status-alignment.sql and a live
# enum_range() check: the type still permits PARTIALLY_FILLED even though
# 002-orders-status-backfill rewrote existing PARTIALLY_FILLED rows to
# FILLED. Included here so any future/legacy row using it is loaded, not
# dead-lettered -- see the README note on why this sits oddly next to the
# sprint contract's "partial fills are out of scope" statement.
VALID_STATUSES = {"NEW", "FILLED", "REJECTED", "CANCELLED", "PARTIALLY_FILLED"}
VALID_SIDES = {"BUY", "SELL"}
