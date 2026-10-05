package com.trade.pricing.generator.pricing;

import com.trade.pricing.generator.fauxnance.FauxnanceCandleClient;
import com.trade.pricing.generator.fauxnance.dto.FauxnanceCandle;
import com.trade.pricing.generator.mapper.CandlePersistenceMapper;
import com.trade.pricing.generator.mapper.PollableSymbolMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;

/**
 * Daily candle persistence scheduler for LEAP-016.
 * Fetches 1-year daily OHLC candles from Fauxnance for all watched symbols
 * and stores them in the market_candles table (only place Fauxnance is called).
 *
 * Runs once daily (default 86400 seconds / 1 day).
 * This is the SINGLE point where Fauxnance is hit for historical candle data.
 */
@Component
public class CandlePersistenceScheduler {

    private static final Logger log = LoggerFactory.getLogger(CandlePersistenceScheduler.class);

    private final PollableSymbolMapper symbolMapper;
    private final FauxnanceCandleClient candleClient;
    private final CandlePersistenceMapper candleMapper;

    public CandlePersistenceScheduler(PollableSymbolMapper symbolMapper,
                                       FauxnanceCandleClient candleClient,
                                       CandlePersistenceMapper candleMapper) {
        this.symbolMapper = symbolMapper;
        this.candleClient = candleClient;
        this.candleMapper = candleMapper;
    }

    /**
     * Daily scheduled job: fetch 1-year candles from Fauxnance and persist to DB.
     * Runs daily at a fixed interval (configurable, default 86400s = 1 day).
     */
    @Scheduled(fixedRateString = "${generator.candle.persistence-interval-seconds:86400}000", initialDelayString = "5000")
    void persistCandles() {
        log.info("Starting daily candle persistence job");
        List<String> symbols = symbolMapper.findPollableSymbols();

        int totalInserted = 0;
        for (String symbol : symbols) {
            try {
                // Fetch 1-year history from Fauxnance
                // Note: FauxnanceCandleClient.fetchLatestCandle() fetches 7 days
                // We need a method that fetches full 1-year history.
                // For now, we'll fetch last 7 days and extend the date range manually
                List<FauxnanceCandle> candles = candleClient.fetchCandlesByRange(symbol);

                if (candles.isEmpty()) {
                    log.warn("No candles returned for symbol {}", symbol);
                    continue;
                }

                // Persist all candles (upsert pattern: insert or update if already exists)
                for (FauxnanceCandle candle : candles) {
                    try {
                        LocalDate candleDate = LocalDate.parse(candle.date());
                        candleMapper.upsertCandle(
                                symbol,
                                "1d",  // interval is always daily from Fauxnance
                                candle.open(),
                                candle.high(),
                                candle.low(),
                                candle.close(),
                                candle.volume(),
                                candleDate,
                                candle.synthetic()
                        );
                        totalInserted++;
                    } catch (Exception e) {
                        log.error("Failed to persist candle for {} on {}", symbol, candle.date(), e);
                    }
                }
                log.info("Persisted {} candles for symbol {}", candles.size(), symbol);

            } catch (Exception e) {
                log.error("Failed to fetch/persist candles for symbol {}", symbol, e);
            }
        }

        log.info("Completed daily candle persistence: {} total candles persisted", totalInserted);
    }
}
