package com.trade.mapper;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// The latest Market_Data close for one symbol, and when it was observed.
public record StoredPriceRow(
        String symbol,
        BigDecimal price,
        OffsetDateTime asOf
) {
}
