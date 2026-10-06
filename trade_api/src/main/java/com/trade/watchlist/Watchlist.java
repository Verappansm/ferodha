package com.trade.watchlist;

import java.util.UUID;

public class Watchlist {
    private final UUID watchlistId;
    private final String name;
    private final UUID userId;
    private final int displayOrder;

    public Watchlist(UUID watchlistId, String name, UUID userId, int displayOrder) {
        this.watchlistId = watchlistId;
        this.name = name;
        this.userId = userId;
        this.displayOrder = displayOrder;
    }

    public UUID getWatchlistId() {
        return watchlistId;
    }

    public String getName() {
        return name;
    }

    public UUID getUserId() {
        return userId;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }
}