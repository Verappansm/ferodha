package com.trade.service;

import com.trade.dto.CandleDto;
import com.trade.dto.CandlesResponseDto;
import com.trade.mapper.CandleMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Service for fetching candle data from market_candles table.
 * Used by LEAP-016 (Instrument Detail Page) to display OHLC charts.
 */
@Service
public class CandleService {

    private static final Logger log = LoggerFactory.getLogger(CandleService.class);

    private final CandleMapper candleMapper;

    public CandleService(CandleMapper candleMapper) {
        this.candleMapper = candleMapper;
    }

    /**
     * Fetch all candles for a symbol with the given interval.
     *
     * @param symbol The instrument symbol (e.g., "AAPL", "TATASTEEL.BO")
     * @param interval The candle interval (e.g., "1d" for daily)
     * @return CandlesResponseDto with list of candles ordered by date descending
     */
    public CandlesResponseDto getCandles(String symbol, String interval) {
        log.debug("Fetching candles for symbol={}, interval={}", symbol, interval);

        List<CandleDto> candles = candleMapper.findCandlesBySymbolAndInterval(symbol, interval);

        if (candles.isEmpty()) {
            log.warn("No candles found for symbol={}, interval={}", symbol, interval);
        } else {
            log.debug("Found {} candles for symbol={}", candles.size(), symbol);
        }

        // Return in chronological order (reverse the list from DB which returns DESC)
        java.util.Collections.reverse(candles);

        return new CandlesResponseDto(symbol, interval, candles);
    }
}
