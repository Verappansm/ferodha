package com.trade.mapper;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

// Price history for the instrument page (LEAP-016): the price feed's
// minute bars (market_bars) and Fauxnance's daily candles (market_candles).
@Mapper
public interface MarketHistoryMapper {

    List<PriceBarRow> findMinuteBars(@Param("symbol") String symbol, @Param("from") OffsetDateTime from);

    List<PriceBarRow> findDailyCandles(@Param("symbol") String symbol, @Param("from") LocalDate from);

    Optional<PriceBarRow> findLatestMinuteBar(@Param("symbol") String symbol);

    PriceRangeRow findMinuteRange(@Param("symbol") String symbol, @Param("from") OffsetDateTime from);

    PriceRangeRow findDailyRange(@Param("symbol") String symbol, @Param("from") LocalDate from);

    // The close of the latest daily candle before the given day.
    Optional<BigDecimal> findCloseBefore(@Param("symbol") String symbol, @Param("day") LocalDate day);

    // findCloseBefore for many symbols in one query; a symbol with no candle is absent
    // (never called with an empty collection).
    List<StoredPriceRow> findClosesBefore(@Param("symbols") Collection<String> symbols, @Param("day") LocalDate day);

    // findMinuteBars' closes for many symbols in one query, oldest first per symbol
    // (never called with an empty collection).
    List<SymbolCloseRow> findMinuteClosesForSymbols(@Param("symbols") Collection<String> symbols,
                                                    @Param("from") OffsetDateTime from);
}
