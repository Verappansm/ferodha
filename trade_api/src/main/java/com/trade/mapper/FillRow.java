package com.trade.mapper;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// One Trades row with what replaying it needs: the instrument, the side of
// the order it filled, and the fill itself.
public record FillRow(
        String symbol,
        String currency,
        String side,
        BigDecimal quantity,
        BigDecimal price,
        OffsetDateTime executedAt
) {
}
