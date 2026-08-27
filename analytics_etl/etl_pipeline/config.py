"""Shared configuration for the ETL pipeline."""

from pathlib import Path
from dotenv import load_dotenv
import os

PROJECT_ROOT = Path(__file__).resolve().parent.parent

ENV_FILE = PROJECT_ROOT / ".env"

load_dotenv(ENV_FILE)

API_URL = os.getenv("API_URL")
# API_KEY must be set via environment variable for security
API_KEY = os.getenv("API_KEY")


SYMBOLS = ["INFY.NS", "RELIANCE.NS", "TATASTEEL.BO","TCS.NS","ICICIBANK.NS","HDFCBANK.NS","ADANIENT.NS"]

CACHE_DIR = PROJECT_ROOT / "data" / "cache"
CACHE_TTL_SECONDS = 60 * 60 * 24  # 24 hours

DB_PATH = str(PROJECT_ROOT / "data" / "data.duckdb")
TABLE_NAME = "real_market_data"
