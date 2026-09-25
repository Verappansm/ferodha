package com.trade.generator.pricing;

import com.trade.generator.fauxnance.FauxnanceQuoteClient;
import com.trade.generator.fauxnance.Quote;
import com.trade.generator.mapper.PollableSymbolMapper;
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
    private final FauxnanceQuoteClient quoteClient;
    private final QuoteAnchorStore anchorStore;

    public QuoteRefreshScheduler(PollableSymbolMapper symbolMapper, FauxnanceQuoteClient quoteClient,
                                  QuoteAnchorStore anchorStore) {
        this.symbolMapper = symbolMapper;
        this.quoteClient = quoteClient;
        this.anchorStore = anchorStore;
    }

    @Scheduled(fixedRateString = "${generator.quote.refresh-interval-seconds:300}000", initialDelayString = "0")
    void refresh() {
        List<String> symbols = symbolMapper.findPollableSymbols();
        for (int start = 0; start < symbols.size(); start += BATCH_SIZE) {
            List<String> batch = symbols.subList(start, Math.min(start + BATCH_SIZE, symbols.size()));
            Map<String, Quote> quotes = quoteClient.fetchQuotes(batch);
            quotes.forEach(anchorStore::putAnchor);
        }
    }
}
