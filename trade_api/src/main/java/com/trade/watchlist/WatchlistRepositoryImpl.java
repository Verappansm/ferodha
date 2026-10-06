package com.trade.watchlist;

import com.trade.mapper.WatchlistMapper;
import com.trade.mapper.WatchlistRow;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Component
public class WatchlistRepositoryImpl implements WatchlistRepository {

    private final WatchlistMapper watchlistMapper;

    public WatchlistRepositoryImpl(WatchlistMapper watchlistMapper) {
        this.watchlistMapper = watchlistMapper;
    }

    @Override
    public Optional<Watchlist> findById(UUID watchlistId) {
        return watchlistMapper.findById(watchlistId).map(this::toDomain);
    }

    @Override
    public List<Watchlist> findByUserId(UUID userId) {
        return watchlistMapper.findByUserId(userId).stream()
                .map(this::toDomain)
                .toList();
    }

    @Override
    public Watchlist save(Watchlist watchlist) {
        WatchlistRow row = new WatchlistRow(
                watchlist.getWatchlistId(),
                watchlist.getName(),
                watchlist.getUserId(),
                watchlist.getDisplayOrder()
        );
        watchlistMapper.insert(row);
        return watchlist;
    }

    @Override
    public void deleteById(UUID watchlistId) {
        watchlistMapper.deleteById(watchlistId);
    }

    @Override
    public Optional<Watchlist> findByUserIdAndName(UUID userId, String name) {
        return watchlistMapper.findByUserIdAndName(userId, name).map(this::toDomain);
    }

    @Override
    public int getMaxDisplayOrder(UUID userId) {
        Integer max = watchlistMapper.getMaxDisplayOrder(userId);
        return max != null ? max : 0;
    }

    @Override
    public void updateDisplayOrder(UUID watchlistId, int displayOrder) {
        watchlistMapper.updateDisplayOrder(watchlistId, displayOrder);
    }

    private Watchlist toDomain(WatchlistRow row) {
        return new Watchlist(row.watchlistId(), row.name(), row.userId(), row.displayOrder());
    }
}