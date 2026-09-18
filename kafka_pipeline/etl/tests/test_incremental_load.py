import uuid
from datetime import datetime, timezone
from decimal import Decimal

from etl import facts
from tests.conftest import make_filled_order


def test_incremental_load_populates_fact_trades(con, loaded_dims, now):
    """# an incremental load populates FACT_TRADES"""
    order = make_filled_order(
        loaded_dims["account_id"], loaded_dims["instrument_id"],
        placed_at=datetime(2026, 9, 17, 9, 14, 22, tzinfo=timezone.utc),
    )

    good, dead = facts.resolve_and_transform(
        [order], loaded_dims["id_to_symbol"], loaded_dims["instrument_key_by_symbol"],
        loaded_dims["account_key_by_id"], loaded_dims["valid_date_keys"], "batch-1", now,
    )
    facts.load_facts(con, good, dead, now)

    rows = con.sql("SELECT source_order_id, status, quantity, trade_value FROM fact_trades").fetchall()
    assert len(rows) == 1
    assert rows[0][0] == order["order_id"]
    assert rows[0][1] == "FILLED"
    assert rows[0][2] == 100
    assert rows[0][3] == Decimal("23277.00")


def test_second_load_with_no_new_data_adds_no_rows(con, loaded_dims, now):
    """# a second load with no new data adds no rows"""
    order = make_filled_order(
        loaded_dims["account_id"], loaded_dims["instrument_id"],
        placed_at=datetime(2026, 9, 17, 9, 14, 22, tzinfo=timezone.utc),
    )

    good, dead = facts.resolve_and_transform(
        [order], loaded_dims["id_to_symbol"], loaded_dims["instrument_key_by_symbol"],
        loaded_dims["account_key_by_id"], loaded_dims["valid_date_keys"], "batch-1", now,
    )
    facts.load_facts(con, good, dead, now)
    count_after_first = con.sql("SELECT COUNT(*) FROM fact_trades").fetchone()[0]

    # "no new data": re-resolve/transform the exact same source rows again
    # (as an unchanged incremental window would) and load again.
    good2, dead2 = facts.resolve_and_transform(
        [order], loaded_dims["id_to_symbol"], loaded_dims["instrument_key_by_symbol"],
        loaded_dims["account_key_by_id"], loaded_dims["valid_date_keys"], "batch-2", now,
    )
    facts.load_facts(con, good2, dead2, now)
    count_after_second = con.sql("SELECT COUNT(*) FROM fact_trades").fetchone()[0]

    assert count_after_first == 1
    assert count_after_second == 1, "re-running over the same data must not add rows"


def test_transform_handles_nulls_and_type_mismatches(con, loaded_dims, now):
    """# the transform handles nulls and type mismatches"""
    order = make_filled_order(
        loaded_dims["account_id"], loaded_dims["instrument_id"],
        placed_at=datetime(2026, 9, 17, 9, 14, 22, tzinfo=timezone.utc),
    )
    # No execution row at all (e.g. a still-open order at NEW, or REJECTED): nulls
    # where a fill would normally leave values.
    order["status"] = "REJECTED"
    order["execution_price"] = None
    order["execution_quantity"] = None
    order["executed_at"] = None

    good, dead = facts.resolve_and_transform(
        [order], loaded_dims["id_to_symbol"], loaded_dims["instrument_key_by_symbol"],
        loaded_dims["account_key_by_id"], loaded_dims["valid_date_keys"], "batch-1", now,
    )
    assert len(dead) == 0
    assert len(good) == 1
    assert good[0].status == "REJECTED"
    assert good[0].executed_price is None
    # falls back to the ordered quantity/limit_price when there's no execution
    assert good[0].quantity == 100
    assert good[0].trade_value == Decimal("23300.00")

    # A genuinely unparseable value must be dead-lettered, not crash the batch.
    bad_type_order = make_filled_order(
        loaded_dims["account_id"], loaded_dims["instrument_id"],
        placed_at=datetime(2026, 9, 17, 9, 20, 0, tzinfo=timezone.utc),
    )
    bad_type_order["quantity"] = "not-a-number"
    bad_type_order["execution_quantity"] = "not-a-number"

    good2, dead2 = facts.resolve_and_transform(
        [bad_type_order], loaded_dims["id_to_symbol"], loaded_dims["instrument_key_by_symbol"],
        loaded_dims["account_key_by_id"], loaded_dims["valid_date_keys"], "batch-1", now,
    )
    assert len(good2) == 0
    assert len(dead2) == 1
    assert dead2[0]["reason"] == "UNPARSEABLE_QUANTITY"


def test_invalid_row_is_dead_lettered_and_batch_continues(con, loaded_dims, now):
    """# an invalid row is dead-lettered with its reason and the load continues"""
    good_order = make_filled_order(
        loaded_dims["account_id"], loaded_dims["instrument_id"],
        placed_at=datetime(2026, 9, 17, 9, 14, 22, tzinfo=timezone.utc),
    )
    bad_order = make_filled_order(
        loaded_dims["account_id"], loaded_dims["instrument_id"],
        placed_at=datetime(2026, 9, 17, 9, 25, 0, tzinfo=timezone.utc),
    )
    bad_order["quantity"] = Decimal("-5.0000")
    bad_order["execution_quantity"] = Decimal("-5.0000")

    good, dead = facts.resolve_and_transform(
        [good_order, bad_order], loaded_dims["id_to_symbol"], loaded_dims["instrument_key_by_symbol"],
        loaded_dims["account_key_by_id"], loaded_dims["valid_date_keys"], "batch-1", now,
    )
    facts.load_facts(con, good, dead, now)

    assert len(good) == 1
    assert len(dead) == 1
    assert dead[0]["reason"] == "NON_POSITIVE_QUANTITY"
    assert dead[0]["source_order_id"] == bad_order["order_id"]

    fact_count = con.sql("SELECT COUNT(*) FROM fact_trades").fetchone()[0]
    dl_rows = con.sql("SELECT batch_id, reason, source_order_id FROM dead_letter_rows").fetchall()

    assert fact_count == 1, "the good row in the batch must still load"
    assert len(dl_rows) == 1
    assert dl_rows[0][1] == "NON_POSITIVE_QUANTITY"
    assert dl_rows[0][2] == bad_order["order_id"]


def test_order_with_date_outside_loaded_range_is_dead_lettered_not_batch_failed(con, loaded_dims, now):
    """A date_key with no matching dim_date row must be caught per-row,
    the same way an unresolved account_key or instrument_key is -- not
    left to fail the whole batch's transaction at the fact_trades ->
    dim_date foreign key.
    """
    good_order = make_filled_order(
        loaded_dims["account_id"], loaded_dims["instrument_id"],
        placed_at=datetime(2026, 9, 17, 9, 14, 22, tzinfo=timezone.utc),
    )
    # loaded_dims only loads 2020-2029 (see conftest); 2035 is outside that range.
    out_of_range_order = make_filled_order(
        loaded_dims["account_id"], loaded_dims["instrument_id"],
        placed_at=datetime(2035, 1, 15, 9, 0, 0, tzinfo=timezone.utc),
    )

    good, dead = facts.resolve_and_transform(
        [good_order, out_of_range_order], loaded_dims["id_to_symbol"],
        loaded_dims["instrument_key_by_symbol"], loaded_dims["account_key_by_id"],
        loaded_dims["valid_date_keys"], "batch-1", now,
    )
    # this must not raise -- the whole point is that it's caught here, not at INSERT
    facts.load_facts(con, good, dead, now)

    assert len(good) == 1
    assert len(dead) == 1
    assert dead[0]["reason"] == "UNRESOLVED_DATE_KEY"
    assert dead[0]["source_order_id"] == out_of_range_order["order_id"]

    fact_count = con.sql("SELECT COUNT(*) FROM fact_trades").fetchone()[0]
    assert fact_count == 1, "the in-range row must still load even though the batch had a bad date"
