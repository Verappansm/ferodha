package com.trade.mapper;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// One minute bar's close for one symbol: the watchlist's sparklines, read for every
// symbol on the list in one query.
public record SymbolCloseRow(
        String symbol,
        OffsetDateTime time,
        BigDecimal close
) {
}
