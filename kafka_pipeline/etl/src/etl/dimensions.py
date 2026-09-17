from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

import duckdb

_DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
_MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


def load_dim_date(con: duckdb.DuckDBPyConnection, start_year: int, num_years: int = 10) -> int:
   
    start = date(start_year, 1, 1)
    end = date(start_year + num_years, 1, 1)
    rows = []
    d = start
    while d < end:
        rows.append((
            int(d.strftime("%Y%m%d")),
            d,
            d.day,
            d.month,
            d.year,
            (d.month - 1) // 3 + 1,
            d.weekday(),
            _DAY_NAMES[d.weekday()],
            _MONTH_NAMES[d.month - 1],
            d.weekday() < 5,
        ))
        d += timedelta(days=1)

    con.executemany(
        """
        INSERT INTO dim_date
            (date_key, full_date, day, month, year, quarter,
             day_of_week, day_name, month_name, is_weekday)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (full_date) DO NOTHING
        """,
        rows,
    )
    return len(rows)


def load_dim_instrument(con: duckdb.DuckDBPyConnection, instruments: list[dict[str, Any]], now: datetime) -> int:
    
    count = 0
    for row in instruments:
        con.execute(
            
            [row["ticker"], row["name"], row["type"], row["currency"], row["exchange"], now],
        )
        count += 1
    return count


def get_instrument_key_map(con: duckdb.DuckDBPyConnection) -> dict[str, int]:
    
    rows = con.execute("SELECT symbol, instrument_key FROM dim_instrument").fetchall()
    return {symbol: key for symbol, key in rows}


def load_dim_account(con: duckdb.DuckDBPyConnection, accounts: list[dict[str, Any]], as_of: date, now: datetime) -> int:
    
    versions_written = 0
    for row in accounts:
        account_id = str(row["account_id"])
        holder_name = row["holder_name"]
        status = row["holder_status"] or "ACTIVE"

        current = con.execute(
            """
            SELECT account_key, holder_name, status
            FROM dim_account
            WHERE account_id = ? AND is_current = TRUE
            """,
            [account_id],
        ).fetchone()

        if current is None:
            con.execute(
                """
                INSERT INTO dim_account
                    (account_key, account_id, holder_name, status,
                     effective_date, end_date, is_current, loaded_at)
                VALUES (nextval('seq_account_key'), ?, ?, ?, ?, NULL, TRUE, ?)
                """,
                [account_id, holder_name, status, as_of, now],
            )
            versions_written += 1
            continue

        _, current_name, current_status = current
        if current_name == holder_name and current_status == status:
            continue  # nothing changed -- leave the current version alone

        con.execute(
            """
            UPDATE dim_account
            SET end_date = ?, is_current = FALSE
            WHERE account_id = ? AND is_current = TRUE
            """,
            [as_of - timedelta(days=1), account_id],
        )
        con.execute(
            """
            INSERT INTO dim_account
                (account_key, account_id, holder_name, status,
                 effective_date, end_date, is_current, loaded_at)
            VALUES (nextval('seq_account_key'), ?, ?, ?, ?, NULL, TRUE, ?)
            """,
            [account_id, holder_name, status, as_of, now],
        )
        versions_written += 1

    return versions_written


def get_current_account_key_map(con: duckdb.DuckDBPyConnection) -> dict[str, int]:
    """account_id -> account_key, current version only."""
    rows = con.execute(
        "SELECT account_id, account_key FROM dim_account WHERE is_current = TRUE"
    ).fetchall()
    return {account_id: key for account_id, key in rows}
