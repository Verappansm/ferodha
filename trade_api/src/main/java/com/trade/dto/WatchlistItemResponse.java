package com.trade.dto;

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
        List<IntradayPricePoint> intradayData
) {
}