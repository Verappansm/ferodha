package com.trade.watchlist;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WatchlistItemRepository {
    Optional<WatchlistItem> findById(UUID itemId);
    List<WatchlistItem> findByWatchlistId(UUID watchlistId);
    WatchlistItem save(WatchlistItem item);
    void deleteById(UUID itemId);
    Optional<WatchlistItem> findByWatchlistIdAndInstrumentId(UUID watchlistId, UUID instrumentId);
    void deleteByWatchlistIdAndInstrumentId(UUID watchlistId, UUID instrumentId);
    int getMaxDisplayOrder(UUID watchlistId);
    void updateDisplayOrder(UUID itemId, int displayOrder);
    void updateDisplayOrders(UUID watchlistId, java.util.Map<UUID, Integer> itemOrderMap);
    void updateAlert(UUID itemId, BigDecimal alertPrice, String alertDirection);
}