package com.trade.dto;

import java.util.Map;
import java.util.UUID;

public record ReorderWatchlistItemsRequest(
        Map<UUID, Integer> itemOrderMap
) {
}