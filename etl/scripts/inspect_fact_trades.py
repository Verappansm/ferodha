"""Quick manual look at the FACT_TRADES warehouse. Run from anywhere (DUCKDB_PATH
overrides the default database/duckdb/analytics.duckdb):

    python scripts/inspect_fact_trades.py
"""

import duckdb

from etl.config import DuckDBConfig

con = duckdb.connect(DuckDBConfig.from_env().path, read_only=True)

print("dim_date:", con.sql("SELECT COUNT(*) FROM dim_date").fetchone())
print("dim_instrument:", con.sql("SELECT COUNT(*) FROM dim_instrument").fetchone())
print("dim_account:", con.sql("SELECT COUNT(*) FROM dim_account").fetchone())
print("fact_trades:", con.sql("SELECT COUNT(*) FROM fact_trades").fetchone())
con.sql("SELECT * FROM dead_letter_rows").show()
con.sql("SELECT * FROM etl_watermark").show()
con.sql("SELECT status, COUNT(*) FROM fact_trades GROUP BY status").show()
con.sql("SELECT * FROM fact_trades").show(max_rows=50)
