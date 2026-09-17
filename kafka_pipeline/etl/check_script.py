import duckdb

con = duckdb.connect(r'C:\Users\Administrator\Documents\GitHub\chennai-capstone-SE4-team2\analytics_etl\data\data.duckdb')

print('dim_date:', con.sql('SELECT COUNT(*) FROM dim_date').fetchone())
print('dim_instrument:', con.sql('SELECT COUNT(*) FROM dim_instrument').fetchone())
print('dim_account:', con.sql('SELECT COUNT(*) FROM dim_account').fetchone())
print('fact_trades:', con.sql('SELECT COUNT(*) FROM fact_trades').fetchone())
print(con.sql('SELECT * FROM dead_letter_rows').fetchdf())
print(con.sql('SELECT * FROM etl_watermark').fetchdf())