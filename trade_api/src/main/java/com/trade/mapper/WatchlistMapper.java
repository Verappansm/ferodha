package com.trade.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Mapper
public interface WatchlistMapper {

    Optional<WatchlistRow> findById(@Param("watchlistId") UUID watchlistId);

    List<WatchlistRow> findByUserId(@Param("userId") UUID userId);

    List<WatchlistRow> findAll();

    void insert(WatchlistRow row);

    void deleteById(@Param("watchlistId") UUID watchlistId);

    Optional<WatchlistRow> findByUserIdAndName(@Param("userId") UUID userId, @Param("name") String name);

    int getMaxDisplayOrder(@Param("userId") UUID userId);

    void updateDisplayOrder(@Param("watchlistId") UUID watchlistId, @Param("displayOrder") int displayOrder);
}