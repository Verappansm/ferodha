package com.trade.executor.marketmaker;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;

// Identical shape to trade_api's com.trade.event.OrderPlacedPayload (side as
// a plain String rather than trade_api's OrderSide enum - same JSON either
// way, and pulling in a whole enum type here for one field isn't worth it).
// A copy, not a dependency - see EventEnvelope's own note on why.
public record OrderPlacedPayload(
        String orderId,
        Long accountId,
        String symbol,
        String side,
        Integer quantity,
        BigDecimal price,
        String idempotencyKey,
        Instant createdOn,
        // instrument currency -> account currency, as trade_api puts on its own
        // messages; the executor refuses a message without the account's rate
        Map<String, BigDecimal> instrumentToAccountRates
) {
}
