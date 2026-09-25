
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

# trade_api's 002-order-status-alignment.sql recreates order_status_enum as
# exactly NEW/FILLED/REJECTED/CANCELLED, backfilling any legacy PENDING to
# NEW and PARTIALLY_FILLED to FILLED - so PARTIALLY_FILLED cannot occur on
# the live enum today. Kept here defensively (a superset costs nothing: an
# order in this status just never actually shows up to be dead-lettered)
# in case partial-fill support is added to the order lifecycle later.
VALID_STATUSES = {"NEW", "FILLED", "REJECTED", "CANCELLED", "PARTIALLY_FILLED"}
VALID_SIDES = {"BUY", "SELL"}
