package com.trade.executor.fauxnance;

import java.util.Optional;

// Never throws: every outcome, including a Fauxnance outage after the retry
// budget is spent, collapses to Optional.empty(). This is what keeps a
// Fauxnance outage out of the Kafka listener's error-handling path - it is
// resolved by OrderExecutionService as a PRICE_UNAVAILABLE business reject,
// not retried/dead-lettered as an infrastructure fault.
public interface QuoteSource {

    Optional<Quote> fetchQuote(String symbol);
}
