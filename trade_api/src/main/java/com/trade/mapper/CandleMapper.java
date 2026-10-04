package com.trade.mapper;

import com.trade.dto.CandleDto;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * MyBatis mapper for querying candle data from market_candles table.
 */
@Mapper
public interface CandleMapper {

    /**
     * Fetch all candles for a given symbol and interval.
     * Ordered by date descending (most recent first).
     */
    List<CandleDto> findCandlesBySymbolAndInterval(
            @Param("symbol") String symbol,
            @Param("interval") String interval
    );

    /**
     * Check if candles exist for a symbol.
     */
    int countBySymbol(@Param("symbol") String symbol);
}
