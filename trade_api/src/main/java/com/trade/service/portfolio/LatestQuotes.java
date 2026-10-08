package com.trade.service.portfolio;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

// The newest quote seen per symbol on the market-data topic. trade_api holds
// no Fauxnance key (B15), so this is where the portfolio routes get a live
// price: the executor's price feed publishes every tick there, under every profile. Lives in memory only - after a
// restart MarketDataListener re-reads the topic's retained day of quotes.
@Component
public class LatestQuotes {

    // price is the mid the portfolio values a holding at; bid and ask are
    // null when the quote came from a stored price rather than the topic.
    public record Quote(BigDecimal price, BigDecimal bid, BigDecimal ask, OffsetDateTime asOf) {

        public Quote(BigDecimal price, OffsetDateTime asOf) {
            this(price, null, null, asOf);
        }
    }

    private final Map<String, Quote> bySymbol = new ConcurrentHashMap<>();

    // Keeps whichever quote was observed later. market-data is keyed by
    // symbol, so one partition already orders a symbol's quotes, but a
    // replay after a restart must still never let an old quote win.
    public void record(String symbol, BigDecimal price, OffsetDateTime asOf) {
        record(symbol, new Quote(price, asOf));
    }

    public void record(String symbol, Quote incoming) {
        bySymbol.merge(symbol, incoming,
                (current, next) -> next.asOf().isAfter(current.asOf()) ? next : current);
    }

    public Optional<Quote> find(String symbol) {
        return Optional.ofNullable(bySymbol.get(symbol));
    }
}
