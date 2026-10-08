package com.trade.dto;

import java.util.List;
import java.util.UUID;

public record BulkAddWatchlistItemsRequest(
        String symbol,
        List<UUID> watchlistIds
) {
}