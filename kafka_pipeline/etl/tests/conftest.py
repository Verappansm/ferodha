import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

import duckdb
import pytest

from etl import db, dimensions


@pytest.fixture
def now():
    return datetime(2026, 9, 17, 12, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
def con():
    """A fresh in-memory DuckDB with the Sprint 7 tables migrated in, and
    one instrument + one account already loaded so tests can focus on
    fact_trades behaviour.
    """
    c = duckdb.connect(":memory:")
    db.run_migrations(c)
    yield c
    c.close()


@pytest.fixture
def loaded_dims(con, now):
    dimensions.load_dim_date(con, start_year=2020, num_years=10)

    instrument_id = str(uuid.uuid4())
    dimensions.load_dim_instrument(con, [{
        "instrument_id": instrument_id, "ticker": "AAPL", "name": "Apple Inc.",
        "exchange": "NASDAQ", "currency": "USD", "type": "EQUITY", "sector": "Tech",
    }], now)

    account_id = str(uuid.uuid4())
    dimensions.load_dim_account(con, [{
        "account_id": account_id, "holder_name": "Alice", "holder_status": "ACTIVE",
    }], as_of=date(2026, 9, 17), now=now)

    return {
        "instrument_id": instrument_id,
        "account_id": account_id,
        "instrument_key_by_symbol": dimensions.get_instrument_key_map(con),
        "account_key_by_id": dimensions.get_current_account_key_map(con),
        "id_to_symbol": {instrument_id: "AAPL"},
        "valid_date_keys": dimensions.get_valid_date_keys(con),
    }


def make_filled_order(account_id: str, instrument_id: str, placed_at: datetime, order_id: str | None = None) -> dict:
    return {
        "order_id": order_id or str(uuid.uuid4()),
        "account_id": account_id,
        "instrument_id": instrument_id,
        "side": "BUY",
        "order_type": "LIMIT",
        "limit_price": Decimal("233.00"),
        "quantity": Decimal("100.0000"),
        "status": "FILLED",
        "placed_at": placed_at,
        "execution_price": Decimal("232.77"),
        "execution_quantity": Decimal("100.0000"),
        "executed_at": placed_at,
    }
