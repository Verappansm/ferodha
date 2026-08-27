"""Shared configuration for the ETL pipeline."""

from pathlib import Path

import os

API_URL = os.getenv("API_URL", "https://y4t9nq2bqf.execute-api.eu-west-2.amazonaws.com/v1")
# API_KEY must be set via environment variable for security
API_KEY = os.getenv("API_KEY")


SYMBOLS = ["INFY.NS", "RELIANCE.NS", "TATASTEEL.BO","TCS.NS","ICICIBANK.NS","HDFCBANK.NS","ADANIENT.NS"]

CACHE_DIR = Path(__file__).parent / "data" / "cache"
CACHE_TTL_SECONDS = 60 * 60  * 24 # 24 hours

DB_PATH = str(Path(__file__).parent / "data" / "data.duckdb")
TABLE_NAME = "real_market_data"
