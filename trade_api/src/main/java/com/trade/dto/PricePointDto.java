package com.trade.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// One bar of price history: a minute (1D range) or a trading day.
public record PricePointDto(
        OffsetDateTime time,
        BigDecimal open,
        BigDecimal high,
        BigDecimal low,
        BigDecimal close,
        Long volume
) {
}
