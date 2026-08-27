"""Shared configuration for the ETL pipeline."""

from pathlib import Path

#API_URL = 
#API_KEY =   

SYMBOLS = ["INFY.NS", "RELIANCE.NS", "TATASTEEL.BO","TCS.NS","ICICIBANK.NS","HDFCBANK.NS","ADANIENT.NS"]

CACHE_DIR = Path(__file__).parent / "data" / "cache"
CACHE_TTL_SECONDS = 60 * 60  * 24 # 24 hours

DB_PATH = str(Path(__file__).parent / "data" / "data.duckdb")
TABLE_NAME = "real_market_data"
