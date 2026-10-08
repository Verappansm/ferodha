package com.trade.executor.event;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.trade.executor.enums.OrderSide;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;

// The inbound shape published by trade_api's OrderController. orderId is
// the "ORD-<uuid>" string, parsed back to a UUID by OrderExecutionService.
@JsonIgnoreProperties(ignoreUnknown = true)
public record OrderPlacedPayload(
        String orderId,
        Long accountId,
        String symbol,
        OrderSide side,
        Integer quantity,
        BigDecimal price,
        String idempotencyKey,
        Instant createdOn,
        Map<String, BigDecimal> instrumentToAccountRates
) {
}
