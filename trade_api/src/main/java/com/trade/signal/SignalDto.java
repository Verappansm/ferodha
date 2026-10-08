package com.trade.signal;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * GET /api/v1/instruments/{symbol}/signal: a view on the instrument with the numbers and the
 * sentence that produced it.
 *
 * @param direction BUY, SELL or HOLD
 * @param strength  WEAK, MODERATE or STRONG (HOLD is always WEAK)
 * @param asOf      the date of the latest daily close used
 */
public record SignalDto(
        String symbol,
        String direction,
        String strength,
        String reason,
        BigDecimal sma20,
        BigDecimal sma50,
        BigDecimal rsi14,
        BigDecimal lastClose,
        int closesUsed,
        OffsetDateTime asOf,
        OffsetDateTime computedAt,
        String disclaimer
) {
}
