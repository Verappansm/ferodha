package com.trade.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Mapper
public interface WatchlistItemMapper {

    Optional<WatchlistItemRow> findById(@Param("itemId") UUID itemId);

    List<WatchlistItemRow> findByWatchlistId(@Param("watchlistId") UUID watchlistId);

    void insert(WatchlistItemRow row);

    void deleteById(@Param("itemId") UUID itemId);

    Optional<WatchlistItemRow> findByWatchlistIdAndInstrumentId(@Param("watchlistId") UUID watchlistId, @Param("instrumentId") UUID instrumentId);

    void deleteByWatchlistIdAndInstrumentId(@Param("watchlistId") UUID watchlistId, @Param("instrumentId") UUID instrumentId);

    int getMaxDisplayOrder(@Param("watchlistId") UUID watchlistId);

    void updateDisplayOrder(@Param("itemId") UUID itemId, @Param("displayOrder") int displayOrder);

    int armAlert(@Param("itemId") UUID itemId, @Param("alertPrice") BigDecimal alertPrice,
                 @Param("alertDirection") String alertDirection);

    int cancelAlert(@Param("itemId") UUID itemId);

    List<ActiveAlertRow> findActiveAlertsForSymbol(@Param("symbol") String symbol);

    int markTriggered(@Param("itemId") UUID itemId, @Param("armedAt") java.time.OffsetDateTime armedAt,
                      @Param("price") BigDecimal price);

    void updateDisplayOrders(@Param("watchlistId") UUID watchlistId, @Param("itemOrderMap") Map<UUID, Integer> itemOrderMap);
}
