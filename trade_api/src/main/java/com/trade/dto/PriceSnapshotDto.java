package com.trade.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// One instrument's latest price for the market list: no statistics, so a
// whole page of them costs one request and no history queries.
public record PriceSnapshotDto(
        String symbol,
        BigDecimal bid,
        BigDecimal ask,
        BigDecimal mid,
        OffsetDateTime asOf,
        Boolean stale
) {
}
