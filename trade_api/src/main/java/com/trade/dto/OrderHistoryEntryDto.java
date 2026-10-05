package com.trade.dto;

import com.trade.enums.OrderSide;
import com.trade.enums.OrderStatus;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

//populated after order is created, field for price can be null [before execution]

public record OrderHistoryEntryDto(
        String orderId,
        Long accountId,
        String symbol,
        OrderSide side,
        Integer quantity,
        BigDecimal price,
        BigDecimal executedPrice,
        OrderStatus status,
        String idempotencyKey,
        OffsetDateTime createdOn
) {
}
