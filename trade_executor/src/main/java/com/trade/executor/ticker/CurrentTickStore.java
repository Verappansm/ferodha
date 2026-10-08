package com.trade.executor.ticker;

import com.trade.executor.ticker.fauxnance.Quote;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

// The most recent tick TickGenerator produced per symbol - what
// LiveTickQuoteSource prices fills against, and OrderGenerator quotes at
// under the market-sim profile, and the same value published to
// market-data. One writer (TickGenerator), read by both.
@Component
public class CurrentTickStore {

    private final Map<String, Quote> current = new ConcurrentHashMap<>();

    public void put(String symbol, Quote quote) {
        current.put(symbol, quote);
    }

    public Optional<Quote> get(String symbol) {
        return Optional.ofNullable(current.get(symbol));
    }
}
