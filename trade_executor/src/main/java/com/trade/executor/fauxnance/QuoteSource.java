package com.trade.executor.fauxnance;

import java.util.List;
import java.util.Map;
import java.util.Optional;

// Never throws: every outcome, including a Fauxnance outage after the retry
// budget is spent, collapses to Optional.empty(). This is what keeps a
// Fauxnance outage out of the Kafka listener's error-handling path - it is
// resolved by OrderExecutionService as a PRICE_UNAVAILABLE business reject,
// not retried/dead-lettered as an infrastructure fault.
public interface QuoteSource {

    Optional<Quote> fetchQuote(String symbol);

    // Story 8's batch endpoint: up to 25 symbols in one HTTP call, which
    // counts as a single quota unit regardless of how many symbols it
    // carries - the reason MarketDataPoller batches the call at all. Never
    // throws either: a failed batch simply returns fewer (or zero) entries
    // than requested, and MarketDataPoller just publishes whatever came
    // back - a missed price for one poll cycle isn't a business outcome
    // worth rejecting anything over, unlike an order that needs a price now.
    Map<String, Quote> fetchQuotes(List<String> symbols);
}
