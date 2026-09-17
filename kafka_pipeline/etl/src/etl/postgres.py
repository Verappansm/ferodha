
from __future__ import annotations

from datetime import datetime
from typing import Any

import psycopg
from psycopg.rows import dict_row

from etl.config import PostgresConfig


def connect(cfg: PostgresConfig):
    return psycopg.connect(cfg.dsn, row_factory=dict_row)


def fetch_instruments(conn) -> list[dict[str, Any]]:
    sql = """
        SELECT instrument_id, ticker, name, exchange, currency, type, sector
        FROM instruments
    """
    with conn.cursor() as cur:
        cur.execute(sql)
        return cur.fetchall()


def fetch_accounts(conn) -> list[dict[str, Any]]:
   
    sql = """
        SELECT a.account_id, a.currency, a.cash_balance, a.created_at,
               u.name AS holder_name, u.status AS holder_status
        FROM accounts a
        JOIN users u ON u.user_id = a.user_id
    """
    with conn.cursor() as cur:
        cur.execute(sql)
        return cur.fetchall()


def fetch_orders_since(conn, watermark: datetime) -> list[dict[str, Any]]:
    """Orders placed after `watermark`, left-joined to their trade (if any).

    LEFT JOIN because a REJECTED or CANCELLED order never gets a trades row,
    and those orders must still be loaded (fill rate needs them).
    """
    sql = """
        SELECT o.order_id, o.account_id, o.instrument_id, o.side,
               o.order_type, o.limit_price, o.quantity, o.status,
               o.placed_at,
               t.execution_price, t.execution_quantity, t.executed_at
        FROM orders o
        LEFT JOIN trades t ON t.order_id = o.order_id
        WHERE o.placed_at > %s
        ORDER BY o.placed_at
    """
    with conn.cursor() as cur:
        cur.execute(sql, (watermark,))
        return cur.fetchall()
