package com.trade.strategy;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// One automated rule and everything that bounds it. Ids are text so the SQL
// can cast them and no UUID type handler is involved.
public record Strategy(
        String strategyId,
        String userId,
        Long accountId,
        String name,
        String symbol,
        String side,
        BigDecimal triggerPrice,
        Integer quantity,
        BigDecimal maxSpend,
        Integer maxPosition,
        Integer maxOrders,
        Integer maxFailures,
        Boolean dryRun,
        String status,
        Integer ordersPlaced,
        Integer consecutiveFailures,
        BigDecimal lastPrice,
        OffsetDateTime expiresAt,
        OffsetDateTime createdAt
) {
    public boolean isBuy() {
        return "BUY".equals(side);
    }
}
