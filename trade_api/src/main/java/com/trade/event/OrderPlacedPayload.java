package com.trade.event;

import com.trade.enums.OrderSide;

import java.math.BigDecimal;
import java.time.Instant;

// payload of an ORDER_PLACED event on the orders topic. orderId is the exact
// "ORD-<uuid>" string OrderService already persisted - never re-minted here.
public record OrderPlacedPayload(
        String orderId,
        Long accountId,
        String symbol,
        OrderSide side,
        Integer quantity,
        BigDecimal price,
        String idempotencyKey,
        Instant createdOn
) {
}
