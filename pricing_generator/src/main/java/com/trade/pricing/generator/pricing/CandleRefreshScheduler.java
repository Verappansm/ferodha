package com.trade.pricing.generator.pricing;

import com.trade.pricing.generator.fauxnance.FauxnanceCandleClient;
import com.trade.pricing.generator.fauxnance.dto.FauxnanceCandle;
import com.trade.pricing.generator.mapper.PollableSymbolMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.List;

// Once a day per watched symbol (default 86400s, configurable) - one
// request per symbol, since /candles/{symbol} has no batch form the way
// /quotes does. Negligible against the daily quota either way: even 25
// watched symbols is 25 requests/day for this call alone.
@Component
public class CandleRefreshScheduler {

    private static final Logger log = LoggerFactory.getLogger(CandleRefreshScheduler.class);

    private final PollableSymbolMapper symbolMapper;
    private final FauxnanceCandleClient candleClient;
    private final CandleBoundsStore boundsStore;

    public CandleRefreshScheduler(PollableSymbolMapper symbolMapper, FauxnanceCandleClient candleClient,
                                   CandleBoundsStore boundsStore) {
        this.symbolMapper = symbolMapper;
        this.candleClient = candleClient;
        this.boundsStore = boundsStore;
    }

    @Scheduled(fixedRateString = "${generator.candle.refresh-interval-seconds:86400}000",
            initialDelayString = "0")
    void refresh() {
        List<String> symbols = symbolMapper.findPollableSymbols();
        for (String symbol : symbols) {
            candleClient.fetchLatestCandle(symbol).ifPresentOrElse(
                    candle -> storeBounds(symbol, candle),
                    () -> log.warn("No candle available for {} - keeping previous bounds, if any", symbol));
        }
    }

    private void storeBounds(String symbol, FauxnanceCandle candle) {
        BigDecimal low = candle.low();
        BigDecimal high = candle.high();
        if (low.compareTo(high) > 0) {
            log.warn("Candle for {} has low > high ({} > {}) - skipping", symbol, low, high);
            return;
        }
        boundsStore.put(symbol, new RandomizerModel.Bounds(low, high));
    }
}
