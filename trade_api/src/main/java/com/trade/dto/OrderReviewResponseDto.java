package com.trade.dto;

import com.trade.enums.OrderSide;

import java.math.BigDecimal;

// Every figure the review step shows, worked out on the limit price. Money is
// in the instrument's currency; cashBalance is in the account's. cashRemaining
// is null for a SELL, and when the two currencies differ (the executor
// converts at settlement, so a subtraction here would mix currencies).
public record OrderReviewResponseDto(
        String symbol,
        OrderSide side,
        Integer quantity,
        BigDecimal price,
        String currency,
        BigDecimal estimatedCost,
        BigDecimal feeRate,
        BigDecimal fee,
        BigDecimal total,
        BigDecimal estimatedCostAccountCurrency,
        BigDecimal feeAccountCurrency,
        BigDecimal totalAccountCurrency,
        BigDecimal cashBalance,
        String accountCurrency,
        BigDecimal cashRemaining
) {
}
