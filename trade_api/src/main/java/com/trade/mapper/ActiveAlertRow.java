package com.trade.mapper;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One ACTIVE price alert on a symbol, with its owner. armedAt names this arming of the
 * alert: setting it again gives a new one, so the same threshold can fire again.
 */
public record ActiveAlertRow(
        UUID itemId,
        UUID userId,
        String symbol,
        String name,
        BigDecimal alertPrice,
        String alertDirection,
        OffsetDateTime armedAt
) {
}
