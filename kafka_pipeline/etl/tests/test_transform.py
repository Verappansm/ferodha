from datetime import datetime, timezone
from decimal import Decimal

import pytest

from etl.transform import RowRejected, build_fact_row
from tests.conftest import make_filled_order


def test_recomputes_trade_value_from_executed_price_when_filled():
    order = make_filled_order("acct-1", "instr-1", datetime(2026, 9, 17, tzinfo=timezone.utc))
    row = build_fact_row(order, account_key=1, instrument_key=1, date_key=20260917)
    assert row.trade_value == Decimal("23277.00")  # 100 * 232.77, not the 233.00 limit


def test_falls_back_to_limit_price_when_no_execution_row():
    order = make_filled_order("acct-1", "instr-1", datetime(2026, 9, 17, tzinfo=timezone.utc))
    order.update(status="REJECTED", execution_price=None, execution_quantity=None)
    row = build_fact_row(order, account_key=1, instrument_key=1, date_key=20260917)
    assert row.executed_price is None
    assert row.trade_value == Decimal("23300.00")  # 100 * 233.00 limit price


@pytest.mark.parametrize("bad_side", ["BUYY", "", None])
def test_rejects_invalid_side(bad_side):
    order = make_filled_order("acct-1", "instr-1", datetime(2026, 9, 17, tzinfo=timezone.utc))
    order["side"] = bad_side
    with pytest.raises(RowRejected) as exc:
        build_fact_row(order, account_key=1, instrument_key=1, date_key=20260917)
    assert exc.value.reason.startswith("INVALID_SIDE")


def test_rejects_invalid_status():
    order = make_filled_order("acct-1", "instr-1", datetime(2026, 9, 17, tzinfo=timezone.utc))
    order["status"] = "EXPIRED"  # not a real value in the live enum
    with pytest.raises(RowRejected) as exc:
        build_fact_row(order, account_key=1, instrument_key=1, date_key=20260917)
    assert exc.value.reason.startswith("INVALID_STATUS")


def test_accepts_partially_filled_status():
    """PARTIALLY_FILLED is a legal live enum value (confirmed via
    enum_range()), even though the sprint contract describes partial fills
    as out of scope and an earlier migration backfilled historical
    PARTIALLY_FILLED rows to FILLED. Any row still carrying it -- future or
    otherwise -- must load, not be dead-lettered.
    """
    order = make_filled_order("acct-1", "instr-1", datetime(2026, 9, 17, tzinfo=timezone.utc))
    order["status"] = "PARTIALLY_FILLED"
    order["execution_quantity"] = Decimal("40.0000")  # less than the ordered 100
    row = build_fact_row(order, account_key=1, instrument_key=1, date_key=20260917)
    assert row.status == "PARTIALLY_FILLED"
    assert row.quantity == 40


def test_rejects_non_positive_price():
    order = make_filled_order("acct-1", "instr-1", datetime(2026, 9, 17, tzinfo=timezone.utc))
    order["limit_price"] = Decimal("0")
    order["execution_price"] = Decimal("0")
    with pytest.raises(RowRejected) as exc:
        build_fact_row(order, account_key=1, instrument_key=1, date_key=20260917)
    assert exc.value.reason == "NON_POSITIVE_PRICE"


def test_rounds_fractional_quantity_to_nearest_whole_share():
    order = make_filled_order("acct-1", "instr-1", datetime(2026, 9, 17, tzinfo=timezone.utc))
    order["quantity"] = Decimal("100.4")
    order["execution_quantity"] = Decimal("100.6")
    row = build_fact_row(order, account_key=1, instrument_key=1, date_key=20260917)
    assert row.quantity == 101  # rounds half up
