package com.trade.mapper;

import java.time.OffsetDateTime;
import java.util.UUID;

public record WatchlistItemRow(
        UUID itemId,
        UUID watchlistId,
        UUID instrumentId,
        Integer displayOrder,
        OffsetDateTime addedAt
) {
}