package com.trade.pricing.generator.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// market_bars (trade_api Liquibase 011): one row per symbol per minute,
// behind the instrument page's 1D chart.
@Mapper
public interface MinuteBarMapper {

    // Opens the minute's bar with this price, or folds the price into it:
    // high and low widen, close moves, open stays.
    void upsertTick(@Param("symbol") String symbol,
                    @Param("barStart") OffsetDateTime barStart,
                    @Param("price") BigDecimal price);

    int deleteBefore(@Param("cutoff") OffsetDateTime cutoff);
}
