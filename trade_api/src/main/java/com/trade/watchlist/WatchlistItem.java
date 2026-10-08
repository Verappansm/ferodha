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
    /** ACTIVE, TRIGGERED or CANCELLED; null when no alert was ever set (LEAP-007). */
    private final String alertStatus;
    private final OffsetDateTime alertTriggeredAt;
    private final BigDecimal alertTriggeredPrice;

    public WatchlistItem(UUID itemId, UUID watchlistId, UUID instrumentId, int displayOrder, OffsetDateTime addedAt,
                         BigDecimal alertPrice, String alertDirection) {
        this(itemId, watchlistId, instrumentId, displayOrder, addedAt, alertPrice, alertDirection, null, null, null);
    }

    public WatchlistItem(UUID itemId, UUID watchlistId, UUID instrumentId, int displayOrder, OffsetDateTime addedAt,
                         BigDecimal alertPrice, String alertDirection, String alertStatus,
                         OffsetDateTime alertTriggeredAt, BigDecimal alertTriggeredPrice) {
        this.itemId = itemId;
        this.watchlistId = watchlistId;
        this.instrumentId = instrumentId;
        this.displayOrder = displayOrder;
        this.addedAt = addedAt;
        this.alertPrice = alertPrice;
        this.alertDirection = alertDirection;
        this.alertStatus = alertStatus;
        this.alertTriggeredAt = alertTriggeredAt;
        this.alertTriggeredPrice = alertTriggeredPrice;
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

    public String getAlertStatus() {
        return alertStatus;
    }

    public OffsetDateTime getAlertTriggeredAt() {
        return alertTriggeredAt;
    }

    public BigDecimal getAlertTriggeredPrice() {
        return alertTriggeredPrice;
    }
}
