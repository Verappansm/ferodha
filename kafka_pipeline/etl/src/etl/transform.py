"""
Pure row-level transform and validation. No database, no network -- this is
what makes the interesting cases here actually testable, same principle as
the executor's fill rule.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from etl.config import VALID_SIDES, VALID_STATUSES


class RowRejected(Exception):
    """Raised for any row that fails a data-quality check.

    `reason` is a short machine-readable code, stored alongside the row in
    dead_letter_rows so Monday-morning triage doesn't start from scratch.
    """

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class FactRow:
    account_key: int
    instrument_key: int
    date_key: int
    side: str
    quantity: int
    price: Decimal
    status: str
    executed_price: Decimal | None
    trade_value: Decimal
    source_order_id: str
    created_at: datetime


def resolve_date_key(dt: datetime) -> int:
    """YYYYMMDD integer form, matching dim_date.date_key."""
    return int(dt.strftime("%Y%m%d"))


def _to_decimal(value) -> Decimal:
    return Decimal(str(value))


def build_fact_row(order: dict, account_key: int, instrument_key: int, date_key: int) -> FactRow:
    """Validates and shapes one extracted order (+ optional trade) row.

    `date_key` is resolved and checked against dim_date by the caller
    (facts.resolve_and_transform) *before* this is called -- the same
    referential-integrity pattern already used for account_key and
    instrument_key. This function no longer derives date_key itself, so a
    date outside the loaded range is dead-lettered per-row upstream rather
    than failing at the fact_trades foreign key inside the load transaction.

    `order` is the dict shape produced by postgres.fetch_orders_since:
    order_id, account_id, instrument_id, side, order_type, limit_price,
    quantity, status, placed_at, execution_price, execution_quantity,
    executed_at. The last three are None when the order never got a trade
    row (rejected / cancelled / still open at NEW).

    Raises RowRejected for anything the contract's data-quality section
    names. Never returns a half-valid row.
    """
    side = order["side"]
    if side not in VALID_SIDES:
        raise RowRejected(f"INVALID_SIDE:{side}")

    status = order["status"]
    if status not in VALID_STATUSES:
        raise RowRejected(f"INVALID_STATUS:{status}")

    # Quantity: prefer what was actually executed, fall back to what was
    # ordered (a rejected/cancelled order has no execution_quantity).
    quantity_raw = order.get("execution_quantity")
    if quantity_raw is None:
        quantity_raw = order.get("quantity")
    if quantity_raw is None:
        raise RowRejected("MISSING_QUANTITY")
    try:
        quantity_dec = _to_decimal(quantity_raw)
    except (ValueError, TypeError, InvalidOperation):
        raise RowRejected("UNPARSEABLE_QUANTITY")
    if quantity_dec <= 0:
        raise RowRejected("NON_POSITIVE_QUANTITY")

    # Contract's fact_trades.quantity is INTEGER; the source columns are
    # NUMERIC(18,4). Rounded to the nearest whole share -- flagged as an
    # assumption, since a genuinely fractional-share platform would need
    # the contract's column type revisited, not this rounding.
    quantity_int = int(quantity_dec.to_integral_value(rounding=ROUND_HALF_UP))

    # Price: limit_price is nullable (market orders); fall back to the
    # execution price when there's no limit.
    price_raw = order.get("limit_price")
    if price_raw is None:
        price_raw = order.get("execution_price")
    if price_raw is None:
        raise RowRejected("MISSING_PRICE")
    try:
        price_dec = _to_decimal(price_raw)
    except (ValueError, TypeError, InvalidOperation):
        raise RowRejected("UNPARSEABLE_PRICE")
    if price_dec <= 0:
        raise RowRejected("NON_POSITIVE_PRICE")

    executed_price_raw = order.get("execution_price")
    executed_price_dec = (
        _to_decimal(executed_price_raw).quantize(Decimal("0.01"))
        if executed_price_raw is not None
        else None
    )

    # trade_value is recomputed here, never trusted from upstream.
    value_basis = executed_price_dec if executed_price_dec is not None else price_dec
    trade_value = (Decimal(quantity_int) * value_basis).quantize(Decimal("0.01"))

    created_at = order["placed_at"]
    if created_at is None:
        raise RowRejected("MISSING_PLACED_AT")

    return FactRow(
        account_key=account_key,
        instrument_key=instrument_key,
        date_key=date_key,
        side=side,
        quantity=quantity_int,
        price=price_dec.quantize(Decimal("0.01")),
        status=status,
        executed_price=executed_price_dec,
        trade_value=trade_value,
        source_order_id=str(order["order_id"]),
        created_at=created_at,
    )
