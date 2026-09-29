package com.trade.pricing.generator.pricing;

import com.trade.pricing.generator.fauxnance.Quote;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

// The last real Fauxnance quote per symbol (refreshed every five minutes by
// QuoteRefreshScheduler) and the last synthetic mid TickGenerator produced
// (its mean-reversion memory) - two different things that happen to both be
// "the last value for this symbol," kept as two maps rather than one record
// because they update on different schedules and TickGenerator is the only
// reader/writer of the second one.
@Component
public class QuoteAnchorStore {

    private final Map<String, Quote> anchors = new ConcurrentHashMap<>();
    private final Map<String, BigDecimal> lastMid = new ConcurrentHashMap<>();

    public void putAnchor(String symbol, Quote quote) {
        anchors.put(symbol, quote);
        // A fresh anchor with no prior tick yet seeds the walk at the
        // anchor's own mid, so the very first tick doesn't have to revert
        // from nothing.
        lastMid.putIfAbsent(symbol, mid(quote));
    }

    public Optional<Quote> getAnchor(String symbol) {
        return Optional.ofNullable(anchors.get(symbol));
    }

    public BigDecimal getLastMidOrAnchor(String symbol, Quote anchor) {
        return lastMid.getOrDefault(symbol, mid(anchor));
    }

    public void setLastMid(String symbol, BigDecimal mid) {
        lastMid.put(symbol, mid);
    }

    private static BigDecimal mid(Quote quote) {
        return quote.bid().add(quote.ask()).divide(BigDecimal.valueOf(2), 6, RoundingMode.HALF_UP);
    }
}
