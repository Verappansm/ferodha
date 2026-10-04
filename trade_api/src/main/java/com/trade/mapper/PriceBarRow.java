package com.trade.mapper;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// One minute bar or daily candle, as read for the instrument page.
public record PriceBarRow(
        OffsetDateTime time,
        BigDecimal open,
        BigDecimal high,
        BigDecimal low,
        BigDecimal close,
        Long volume
) {
}
