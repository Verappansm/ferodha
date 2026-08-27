import duckdb

con = duckdb.connect("data.duckdb")
con.sql("SELECT * FROM real_market_data").show()