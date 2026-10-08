package com.trade.mapper;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

public record OrderHistoryRow(
        UUID orderId,
        Long accountId,
        String symbol,
        String side,
        Integer quantity,
        BigDecimal price,
        BigDecimal executedPrice,
        String status,
        String idempotencyKey,
        OffsetDateTime createdOn,
        String rejectionReason,
        String instrumentCurrency,
        String accountCurrency,
        BigDecimal feeAmount,
        BigDecimal feeRate
) {
}
