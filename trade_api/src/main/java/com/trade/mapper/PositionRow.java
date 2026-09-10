package com.trade.mapper;

import java.math.BigDecimal;

public record PositionRow(
        Long accountId,
        String symbol,
        Long quantity,
        BigDecimal averageCost
) {
}
