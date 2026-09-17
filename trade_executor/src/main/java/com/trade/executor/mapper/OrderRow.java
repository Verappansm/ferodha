package com.trade.executor.mapper;

import java.math.BigDecimal;
import java.util.UUID;

// One Orders row, joined out to the numeric account surrogate and the
// instrument's ticker/id - everything OrderExecutionService needs without a
// second round trip for the common case.
public record OrderRow(
        UUID orderId,
        Long accountId,
        UUID instrumentId,
        String symbol,
        String side,
        Integer quantity,
        BigDecimal limitPrice,
        String status
) {
}
