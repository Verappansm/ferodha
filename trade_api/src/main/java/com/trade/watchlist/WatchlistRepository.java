package com.trade.watchlist;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface WatchlistRepository {
    Optional<Watchlist> findById(UUID watchlistId);
    List<Watchlist> findByUserId(UUID userId);
    Watchlist save(Watchlist watchlist);
    void deleteById(UUID watchlistId);
    Optional<Watchlist> findByUserIdAndName(UUID userId, String name);
    int getMaxDisplayOrder(UUID userId);
    void updateDisplayOrder(UUID watchlistId, int displayOrder);
}