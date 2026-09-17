#row-level transform and validation

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from etl.config import VALID_SIDES, VALID_STATUSES


class RowRejected(Exception):
    #Raised for any row that fails a data-quality check.

   

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
    
    return int(dt.strftime("%Y%m%d"))


def _to_decimal(value) -> Decimal:
    return Decimal(str(value))


def build_fact_row(order: dict, account_key: int, instrument_key: int) -> FactRow:
    
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

    
    quantity_int = int(quantity_dec.to_integral_value(rounding=ROUND_HALF_UP))

    
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

    
    value_basis = executed_price_dec if executed_price_dec is not None else price_dec
    trade_value = (Decimal(quantity_int) * value_basis).quantize(Decimal("0.01"))

    created_at = order["placed_at"]
    if created_at is None:
        raise RowRejected("MISSING_PLACED_AT")

    return FactRow(
        account_key=account_key,
        instrument_key=instrument_key,
        date_key=resolve_date_key(created_at),
        side=side,
        quantity=quantity_int,
        price=price_dec.quantize(Decimal("0.01")),
        status=status,
        executed_price=executed_price_dec,
        trade_value=trade_value,
        source_order_id=str(order["order_id"]),
        created_at=created_at,
    )
