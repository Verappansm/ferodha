package com.trade.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// GET /api/v1/instruments/{symbol}/quote: the latest quote and the key
// statistics the stored history supports. Any figure the data cannot back
// is null rather than guessed.
public record InstrumentQuoteDto(
        String symbol,
        String currency,
        BigDecimal bid,
        BigDecimal ask,
        BigDecimal mid,
        OffsetDateTime asOf,
        Boolean stale,
        BigDecimal dayLow,
        BigDecimal dayHigh,
        BigDecimal previousClose,
        BigDecimal week52Low,
        BigDecimal week52High
) {
}
