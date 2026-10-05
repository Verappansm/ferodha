package com.trade.pricing.generator.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;
import java.time.LocalDate;

@Mapper
public interface CandlePersistenceMapper {

    /**
     * Insert or update a candle using the upsert_candle function.
     * Uses the database trigger to handle duplicates (UNIQUE constraint on symbol, interval, candle_time).
     */
    void upsertCandle(
            @Param("symbol") String symbol,
            @Param("interval") String interval,
            @Param("open") BigDecimal open,
            @Param("high") BigDecimal high,
            @Param("low") BigDecimal low,
            @Param("close") BigDecimal close,
            @Param("volume") Long volume,
            @Param("candleTime") LocalDate candleTime,
            @Param("synthetic") boolean synthetic
    );

    /**
     * Delete candles older than a certain date for a symbol/interval combo.
     * Used for cleanup if needed.
     */
    void deleteOldCandles(
            @Param("symbol") String symbol,
            @Param("interval") String interval,
            @Param("beforeDate") LocalDate beforeDate
    );
}
