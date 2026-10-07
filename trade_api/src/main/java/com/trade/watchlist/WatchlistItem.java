package com.trade.watchlist;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

public class WatchlistItem {
    private final UUID itemId;
    private final UUID watchlistId;
    private final UUID instrumentId;
    private final int displayOrder;
    private final OffsetDateTime addedAt;
    private final BigDecimal alertPrice;
    private final String alertDirection;

    public WatchlistItem(UUID itemId, UUID watchlistId, UUID instrumentId, int displayOrder, OffsetDateTime addedAt,
                         BigDecimal alertPrice, String alertDirection) {
        this.itemId = itemId;
        this.watchlistId = watchlistId;
        this.instrumentId = instrumentId;
        this.displayOrder = displayOrder;
        this.addedAt = addedAt;
        this.alertPrice = alertPrice;
        this.alertDirection = alertDirection;
    }

    public UUID getItemId() {
        return itemId;
    }

    public UUID getWatchlistId() {
        return watchlistId;
    }

    public UUID getInstrumentId() {
        return instrumentId;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }

    public OffsetDateTime getAddedAt() {
        return addedAt;
    }

    public BigDecimal getAlertPrice() {
        return alertPrice;
    }

    public String getAlertDirection() {
        return alertDirection;
    }
}