package com.trade.mapper;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

// Everything needed to rebuild an ORDER_PLACED event for an order whose first
// publish was never acknowledged. accountId is the numeric Accounts.id the
// event carries, not the UUID key.
public record UnpublishedOrderRow(
        UUID orderId,
        Long accountId,
        String symbol,
        String instrumentCurrency,
        String side,
        Integer quantity,
        BigDecimal price,
        String idempotencyKey,
        OffsetDateTime placedAt
) {
}
