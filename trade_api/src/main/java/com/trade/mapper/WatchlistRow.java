package com.trade.mapper;

import java.util.UUID;

public record WatchlistRow(
        UUID watchlistId,
        String name,
        UUID userId,
        Integer displayOrder
) {
}