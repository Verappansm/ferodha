package com.trade.mapper;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// The latest stored close for one symbol (minute bar or daily candle), and
// when it was observed.
public record StoredPriceRow(
        String symbol,
        BigDecimal price,
        OffsetDateTime asOf
) {
}
