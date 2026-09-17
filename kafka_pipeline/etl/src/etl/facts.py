from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any

import duckdb

from etl.config import PIPELINE_NAME
from etl.dimensions import get_current_account_key_map, get_instrument_key_map
from etl.transform import FactRow, RowRejected, build_fact_row


@dataclass(frozen=True)
class LoadResult:
    rows_loaded: int
    rows_dead_lettered: int
    watermark_advanced_to: datetime | None


_EPOCH = datetime(1970, 1, 1)


def get_watermark(con: duckdb.DuckDBPyConnection) -> datetime:
    row = con.execute(
        "SELECT last_placed_at FROM etl_watermark WHERE pipeline_name = ?",
        [PIPELINE_NAME],
    ).fetchone()
    return row[0] if row else _EPOCH


def set_watermark(con: duckdb.DuckDBPyConnection, value: datetime) -> None:
    con.execute(
        """
        INSERT INTO etl_watermark (pipeline_name, last_placed_at)
        VALUES (?, ?)
        ON CONFLICT (pipeline_name) DO UPDATE SET last_placed_at = excluded.last_placed_at
        """,
        [PIPELINE_NAME, value],
    )


def _json_default(value: Any) -> str:
    return str(value)


def _dead_letter_record(batch_id: str, order: dict, reason: str, now: datetime) -> dict:
    return {
        "batch_id": batch_id,
        "source_order_id": str(order.get("order_id")) if order.get("order_id") else None,
        "reason": reason,
        "raw_row": json.dumps(order, default=_json_default),
        "failed_at": now,
    }


def resolve_and_transform(
    orders: list[dict],
    instrument_id_to_symbol: dict[str, str],
    instrument_key_by_symbol: dict[str, int],
    account_key_by_id: dict[str, int],
    batch_id: str,
    now: datetime,
) -> tuple[list[FactRow], list[dict]]:
    
    good: list[FactRow] = []
    dead_letters: list[dict] = []

    for order in orders:
        account_id = str(order["account_id"])
        instrument_id = str(order["instrument_id"])

        account_key = account_key_by_id.get(account_id)
        if account_key is None:
            dead_letters.append(_dead_letter_record(batch_id, order, "UNRESOLVED_ACCOUNT_KEY", now))
            continue

        symbol = instrument_id_to_symbol.get(instrument_id)
        instrument_key = instrument_key_by_symbol.get(symbol) if symbol else None
        if instrument_key is None:
            dead_letters.append(_dead_letter_record(batch_id, order, "UNRESOLVED_INSTRUMENT_KEY", now))
            continue

        try:
            fact = build_fact_row(order, account_key, instrument_key)
        except RowRejected as exc:
            dead_letters.append(_dead_letter_record(batch_id, order, exc.reason, now))
            continue

        good.append(fact)

    return good, dead_letters


def load_facts(
    con: duckdb.DuckDBPyConnection,
    good_rows: list[FactRow],
    dead_letters: list[dict],
    now: datetime,
) -> None:
   
    con.execute("BEGIN TRANSACTION")
    try:
        if good_rows:
            source_ids = [row.source_order_id for row in good_rows]
            con.execute(
                "DELETE FROM fact_trades WHERE source_order_id = ANY(?)",
                [source_ids],
            )
            con.executemany(
                """
                INSERT INTO fact_trades
                    (trade_key, account_key, instrument_key, date_key, side,
                     quantity, price, status, executed_price, trade_value,
                     source_order_id, created_at, loaded_at)
                VALUES (nextval('seq_trade_key'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        r.account_key, r.instrument_key, r.date_key, r.side,
                        r.quantity, r.price, r.status, r.executed_price,
                        r.trade_value, r.source_order_id, r.created_at, now,
                    )
                    for r in good_rows
                ],
            )

        if dead_letters:
            con.executemany(
                """
                INSERT INTO dead_letter_rows
                    (dead_letter_id, batch_id, source_order_id, reason, raw_row, failed_at)
                VALUES (nextval('seq_dead_letter_id'), ?, ?, ?, ?, ?)
                """,
                [
                    (dl["batch_id"], dl["source_order_id"], dl["reason"], dl["raw_row"], dl["failed_at"])
                    for dl in dead_letters
                ],
            )
        con.execute("COMMIT")
    except Exception:
        con.execute("ROLLBACK")
        raise


def run_incremental_load(
    pg_conn,
    duck_con: duckdb.DuckDBPyConnection,
    batch_id: str,
    now: datetime,
) -> LoadResult:
    
    from etl import postgres  # local import keeps transform.py DB-free

    watermark = get_watermark(duck_con)
    orders = postgres.fetch_orders_since(pg_conn, watermark)
    if not orders:
        return LoadResult(rows_loaded=0, rows_dead_lettered=0, watermark_advanced_to=None)

    instruments = postgres.fetch_instruments(pg_conn)
    instrument_id_to_symbol = {str(i["instrument_id"]): i["ticker"] for i in instruments}
    instrument_key_by_symbol = get_instrument_key_map(duck_con)
    account_key_by_id = get_current_account_key_map(duck_con)

    good_rows, dead_letters = resolve_and_transform(
        orders, instrument_id_to_symbol, instrument_key_by_symbol, account_key_by_id, batch_id, now,
    )

    load_facts(duck_con, good_rows, dead_letters, now)

    new_watermark = max(o["placed_at"] for o in orders)
    set_watermark(duck_con, new_watermark)

    return LoadResult(
        rows_loaded=len(good_rows),
        rows_dead_lettered=len(dead_letters),
        watermark_advanced_to=new_watermark,
    )
