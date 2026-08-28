"""Shared configuration for the ETL pipeline.

The Fauxnance key and base URL are read from the environment and nowhere
else. Copy .env.example (repository root) to .env, fill it in, and it is
picked up automatically -- .env is git-ignored.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

API_URL = os.environ.get("FAUXNANCE_API_URL")
API_KEY = os.environ.get("FAUXNANCE_API_KEY")

# Universe: seven names across NSE and BSE (criterion 6 needs at least two).
SYMBOLS = [
    "INFY.NS",
    "RELIANCE.NS",
    "TATASTEEL.BO",
    "TCS.NS",
    "ICICIBANK.NS",
    "HDFCBANK.NS",
    "ADANIENT.NS",
]

PROJECT_ROOT = Path(__file__).resolve().parent.parent

CACHE_DIR = PROJECT_ROOT / "data" / "cache"
CACHE_TTL_SECONDS = 60 * 60 * 24  # 24 hours

DB_PATH = str(PROJECT_ROOT / "data" / "data.duckdb")
TABLE_NAME = "real_market_data"
