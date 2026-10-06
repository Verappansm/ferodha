package com.trade.dto;

import java.util.List;
import java.util.UUID;

public record WatchlistResponse(
        UUID watchlistId,
        String name,
        int displayOrder,
        List<WatchlistItemResponse> items
) {
}