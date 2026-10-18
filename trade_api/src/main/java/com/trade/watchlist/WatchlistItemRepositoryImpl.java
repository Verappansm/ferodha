package com.trade.watchlist;

import com.trade.mapper.WatchlistItemMapper;
import com.trade.mapper.WatchlistItemRow;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Component
public class WatchlistItemRepositoryImpl implements WatchlistItemRepository {

    private final WatchlistItemMapper watchlistItemMapper;

    public WatchlistItemRepositoryImpl(WatchlistItemMapper watchlistItemMapper) {
        this.watchlistItemMapper = watchlistItemMapper;
    }

    @Override
    public Optional<WatchlistItem> findById(UUID itemId) {
        return watchlistItemMapper.findById(itemId).map(this::toDomain);
    }

    @Override
    public List<WatchlistItem> findByWatchlistId(UUID watchlistId) {
        return watchlistItemMapper.findByWatchlistId(watchlistId).stream()
                .map(this::toDomain)
                .toList();
    }

    @Override
    public List<WatchlistItem> findByWatchlistIds(Collection<UUID> watchlistIds) {
        if (watchlistIds.isEmpty()) {
            return List.of();
        }
        return watchlistItemMapper.findByWatchlistIds(watchlistIds).stream()
                .map(this::toDomain)
                .toList();
    }

    @Override
    public WatchlistItem save(WatchlistItem item) {
        WatchlistItemRow row = new WatchlistItemRow(
                item.getItemId(),
                item.getWatchlistId(),
                item.getInstrumentId(),
                item.getDisplayOrder(),
                item.getAddedAt(),
                item.getAlertPrice(),
                item.getAlertDirection(),
                item.getAlertStatus(),
                item.getAlertTriggeredAt(),
                item.getAlertTriggeredPrice()
        );
        watchlistItemMapper.insert(row);
        return item;
    }

    @Override
    public void deleteById(UUID itemId) {
        watchlistItemMapper.deleteById(itemId);
    }

    @Override
    public Optional<WatchlistItem> findByWatchlistIdAndInstrumentId(UUID watchlistId, UUID instrumentId) {
        return watchlistItemMapper.findByWatchlistIdAndInstrumentId(watchlistId, instrumentId).map(this::toDomain);
    }

    @Override
    public void deleteByWatchlistIdAndInstrumentId(UUID watchlistId, UUID instrumentId) {
        watchlistItemMapper.deleteByWatchlistIdAndInstrumentId(watchlistId, instrumentId);
    }

    @Override
    public int getMaxDisplayOrder(UUID watchlistId) {
        Integer max = watchlistItemMapper.getMaxDisplayOrder(watchlistId);
        return max != null ? max : 0;
    }

    @Override
    public void updateDisplayOrder(UUID itemId, int displayOrder) {
        watchlistItemMapper.updateDisplayOrder(itemId, displayOrder);
    }

    @Override
    public void armAlert(UUID itemId, BigDecimal alertPrice, String alertDirection) {
        watchlistItemMapper.armAlert(itemId, alertPrice, alertDirection);
    }

    @Override
    public void cancelAlert(UUID itemId) {
        watchlistItemMapper.cancelAlert(itemId);
    }

    @Override
    public void updateDisplayOrders(UUID watchlistId, Map<UUID, Integer> itemOrderMap) {
        watchlistItemMapper.updateDisplayOrders(watchlistId, itemOrderMap);
    }

    private WatchlistItem toDomain(WatchlistItemRow row) {
        return new WatchlistItem(row.itemId(), row.watchlistId(), row.instrumentId(), row.displayOrder(), row.addedAt(),
                row.alertPrice(), row.alertDirection(), row.alertStatus(), row.alertTriggeredAt(),
                row.alertTriggeredPrice());
    }
}
