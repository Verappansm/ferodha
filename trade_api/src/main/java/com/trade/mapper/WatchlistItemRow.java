package com.trade.mapper;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

public record WatchlistItemRow(
        UUID itemId,
        UUID watchlistId,
        UUID instrumentId,
        Integer displayOrder,
        OffsetDateTime addedAt,
        BigDecimal alertPrice,
        String alertDirection
) {
}