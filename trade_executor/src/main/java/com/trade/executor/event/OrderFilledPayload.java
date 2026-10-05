package com.trade.executor.event;

import java.math.BigDecimal;
import java.time.Instant;

public record OrderFilledPayload(
        String orderId,
        Long accountId,
        String symbol,
        BigDecimal executedPrice,
        BigDecimal feeAmount,
        Instant executedOn
) {
}
