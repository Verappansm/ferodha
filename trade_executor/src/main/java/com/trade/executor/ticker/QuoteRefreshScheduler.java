package com.trade.executor.ticker;

import com.trade.executor.ticker.fauxnance.TickerFauxnanceQuoteClient;
import com.trade.executor.ticker.fauxnance.Quote;
import com.trade.executor.mapper.PollableSymbolMapper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

// Every five minutes (default, configurable): the real anchor
// TickGenerator's synthetic ticks revert toward between refreshes. Batched
// exactly the way MarketDataPoller batches its own real polling - up to 25
// symbols per call, one quota unit regardless of count.
@Component
public class QuoteRefreshScheduler {

    private static final int BATCH_SIZE = 25;

    private final PollableSymbolMapper symbolMapper;
    private final TickerFauxnanceQuoteClient tickStore;
    private final QuoteAnchorStore anchorStore;

    public QuoteRefreshScheduler(PollableSymbolMapper symbolMapper, TickerFauxnanceQuoteClient tickStore,
                                  QuoteAnchorStore anchorStore) {
        this.symbolMapper = symbolMapper;
        this.tickStore = tickStore;
        this.anchorStore = anchorStore;
    }

    @Scheduled(fixedRateString = "${generator.quote.refresh-interval-seconds:300}000", initialDelayString = "0")
    void refresh() {
        List<String> symbols = symbolMapper.findTradableHeldOrWatchedSymbols();
        for (int start = 0; start < symbols.size(); start += BATCH_SIZE) {
            List<String> batch = symbols.subList(start, Math.min(start + BATCH_SIZE, symbols.size()));
            Map<String, Quote> quotes = tickStore.fetchQuotes(batch);
            quotes.forEach(anchorStore::putAnchor);
        }
    }
}
