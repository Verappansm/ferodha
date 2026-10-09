"""Quick manual look at the analytical store. Run from anywhere:

    python scripts/inspect_market_data.py
"""

import duckdb

from etl_pipeline.config import DB_PATH, TABLE_NAME

con = duckdb.connect(DB_PATH, read_only=True)
con.sql(f"SELECT * FROM {TABLE_NAME} ORDER BY symbol, date").show(max_rows=50)
con.sql(f"SELECT symbol, COUNT(*) AS rows, MIN(date) AS first_day, MAX(date) AS last_day FROM {TABLE_NAME} GROUP BY symbol ORDER BY symbol").show()
