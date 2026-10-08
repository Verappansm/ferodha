package com.trade.dto;

import java.util.UUID;

public record AddWatchlistItemRequest(
        String symbol,
        UUID watchlistId
) {
}