package com.trade.dto;

import java.math.BigDecimal;

//account portfolio's instrument and quantity
public record PositionResponseDto(
        Long accountId,
        String symbol,
        Integer quantity,
        BigDecimal averageCost
) {
}
