package com.trade.watchlist;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WatchlistItemRepository {
    Optional<WatchlistItem> findById(UUID itemId);
    List<WatchlistItem> findByWatchlistId(UUID watchlistId);

    /** The items of all these watchlists; the database implementation uses one query. */
    default List<WatchlistItem> findByWatchlistIds(Collection<UUID> watchlistIds) {
        return watchlistIds.stream().flatMap(id -> findByWatchlistId(id).stream()).toList();
    }
    WatchlistItem save(WatchlistItem item);
    void deleteById(UUID itemId);
    Optional<WatchlistItem> findByWatchlistIdAndInstrumentId(UUID watchlistId, UUID instrumentId);
    void deleteByWatchlistIdAndInstrumentId(UUID watchlistId, UUID instrumentId);
    int getMaxDisplayOrder(UUID watchlistId);
    void updateDisplayOrder(UUID itemId, int displayOrder);
    void updateDisplayOrders(UUID watchlistId, java.util.Map<UUID, Integer> itemOrderMap);
    /** Sets the threshold and arms the alert (ACTIVE). */
    void armAlert(UUID itemId, BigDecimal alertPrice, String alertDirection);

    /** Stops the alert for good; its threshold stays readable. */
    void cancelAlert(UUID itemId);
}
