"""
LOAD
Writes the cleaned candle data into a DuckDB table, avoiding duplicate
(symbol, date) rows across repeated runs.
"""

import duckdb
import pandas as pd

from config import DB_PATH, TABLE_NAME


def load(df: pd.DataFrame):
    if df.empty:
        print("[load] nothing to load — empty dataframe")
        return

    con = duckdb.connect(DB_PATH)
    con.execute(f"""
        CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
            symbol    VARCHAR,
            date      DATE,
            open      DOUBLE,
            high      DOUBLE,
            low       DOUBLE,
            close     DOUBLE,
            adjclose  DOUBLE,
            volume    BIGINT,
            currency  VARCHAR,
            interval  VARCHAR,
            PRIMARY KEY (symbol, date)
        )
    """)

    con.register("df_view", df)
    con.execute(f"""
        INSERT INTO {TABLE_NAME}
        SELECT df_view.* FROM df_view
        LEFT JOIN {TABLE_NAME} existing
          ON df_view.symbol = existing.symbol AND df_view.date = existing.date
        WHERE existing.symbol IS NULL
    """)

    count = con.execute(f"SELECT COUNT(*) FROM {TABLE_NAME}").fetchone()[0]
    print(f"[load] {TABLE_NAME} now has {count} rows total")
    con.close()
