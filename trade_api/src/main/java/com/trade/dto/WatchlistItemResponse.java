package com.trade.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record WatchlistItemResponse(
        UUID itemId,
        UUID instrumentId,
        String symbol,
        String name,
        String exchange,
        String currency,
        String sector,
        double lastPrice,
        double dayChange,
        double dayChangePercent,
        OffsetDateTime lastUpdated,
        OffsetDateTime addedAt,
        int displayOrder,
        List<IntradayPricePoint> intradayData,
        BigDecimal alertPrice,
        String alertDirection,
        /** ACTIVE, TRIGGERED or CANCELLED; null when no alert was ever set (LEAP-007). */
        String alertStatus,
        OffsetDateTime alertTriggeredAt,
        BigDecimal alertTriggeredPrice
) {
}
