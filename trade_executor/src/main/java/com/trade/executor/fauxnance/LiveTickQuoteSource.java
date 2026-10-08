package com.trade.executor.fauxnance;

import com.trade.executor.ticker.CurrentTickStore;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

// The live ticker as the executor's price source, under every profile: the current tick the
// executor's own price feed (com.trade.executor.ticker) is publishing to market-data, read in
// process. A BUY is priced at the ticker's ask and a SELL at its bid by FillRule, the same
// numbers the UI shows and the order ticket suggests, so a limit price chosen from what is on
// screen fills. With no tick yet for a symbol it answers empty and the order is rejected
// PRICE_UNAVAILABLE. The retired direct-to-Fauxnance source is FauxnanceQuoteClient (profile
// fauxnance-direct), which switches this off.
@Component
@Profile("!fauxnance-direct")
public class LiveTickQuoteSource implements QuoteSource {

    private final CurrentTickStore ticks;

    public LiveTickQuoteSource(CurrentTickStore ticks) {
        this.ticks = ticks;
    }

    @Override
    public Optional<Quote> fetchQuote(String symbol) {
        return ticks.get(symbol)
                .filter(tick -> tick.bid() != null && tick.ask() != null)
                .map(tick -> new Quote(tick.symbol(), tick.bid(), tick.ask(), tick.currency()));
    }

    @Override
    public Map<String, Quote> fetchQuotes(List<String> symbols) {
        Map<String, Quote> result = new LinkedHashMap<>();
        for (String symbol : symbols) {
            fetchQuote(symbol).ifPresent(quote -> result.put(symbol, quote));
        }
        return result;
    }
}
