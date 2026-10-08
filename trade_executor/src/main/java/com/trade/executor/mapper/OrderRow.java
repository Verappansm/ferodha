package com.trade.executor.mapper;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

// One Orders row, joined out to the numeric account surrogate and the
// instrument's ticker/id - everything OrderExecutionService needs without a
// second round trip for the common case. filledQuantity and placedAt exist
// only for the matching engine (quantity - filledQuantity is what's still
// resting; placedAt gives price-time priority its "time" half) - both are
// harmless, always-populated columns for every order, matching-engine
// enabled or not. feeRate is the commission rate trade_api wrote on the order
// when it accepted it (LEAP-017); every fill of the order is charged at it.
public record OrderRow(
        UUID orderId,
        Long accountId,
        UUID instrumentId,
        String symbol,
        String side,
        Integer quantity,
        BigDecimal limitPrice,
        String status,
        Integer filledQuantity,
        OffsetDateTime placedAt,
        BigDecimal feeRate
) {
    public int remainingQuantity() {
        return quantity - filledQuantity;
    }
}
