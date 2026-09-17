package com.trade.mapper;

import java.math.BigDecimal;
import java.util.UUID;

// One Orders row as read back for the cancel path. accountId is the numeric
// surrogate (joined in from Accounts), needed to check that the caller's
// token reaches the account that owns this order.
public record OrderRow(
        UUID orderId,
        Long accountId,
        String symbol,
        String side,
        Integer quantity,
        BigDecimal price,
        BigDecimal executedPrice,
        String status
) {
}
