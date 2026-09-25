package com.trade.generator.fauxnance;

import com.trade.generator.fauxnance.dto.FauxnanceBatchQuoteItem;
import com.trade.generator.fauxnance.dto.FauxnanceBatchQuotesEnvelope;
import com.trade.generator.fauxnance.dto.FauxnanceQuoteDetail;
import com.trade.generator.fauxnance.dto.FauxnanceQuoteEnvelope;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

// Design question 4: treats a Fauxnance outage as a business outcome, not an
// infrastructure fault. Retries a bounded number of times inside this
// client (transient I/O errors, timeouts, 5xx, 429), doubling the backoff
// each time; a non-retryable 4xx (e.g. an unknown symbol) fails immediately
// without spending the rest of the budget. Every path - including budget
// exhaustion - returns Optional.empty() rather than throwing, so the caller
// resolves the order to PRICE_UNAVAILABLE instead of it ever propagating
// into the Kafka listener's retry/dead-letter handling.
@Component
public class FauxnanceQuoteClient {

    private static final Logger log = LoggerFactory.getLogger(FauxnanceQuoteClient.class);

    private final RestClient restClient;
    private final int maxAttempts;
    private final long initialBackoffMs;

    public FauxnanceQuoteClient(@Qualifier("fauxnanceRestClient") RestClient restClient,
                                 @Value("${generator.quote.retry.max-attempts:3}") int maxAttempts,
                                 @Value("${generator.quote.retry.backoff-ms:300}") long initialBackoffMs) {
        this.restClient = restClient;
        this.maxAttempts = maxAttempts;
        this.initialBackoffMs = initialBackoffMs;
    }

    public Optional<Quote> fetchQuote(String symbol) {
        long backoff = initialBackoffMs;

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return Optional.ofNullable(fetchOnce(symbol));
            } catch (HttpClientErrorException e) {
                if (e.getStatusCode().value() != 429) {
                    log.warn("Fauxnance returned {} for symbol {} - not retrying", e.getStatusCode(), symbol);
                    return Optional.empty();
                }
                log.warn("Fauxnance rate-limited quote for {} (attempt {}/{})", symbol, attempt, maxAttempts);
            } catch (RestClientException e) {
                // Covers HttpServerErrorException (5xx) and
                // ResourceAccessException (I/O error, timeout) too - both
                // are subclasses, so a separate catch for each would be
                // unreachable dead code alongside this one.
                log.warn("Fauxnance quote call for {} failed (attempt {}/{}): {}",
                        symbol, attempt, maxAttempts, e.getMessage());
            }

            if (attempt == maxAttempts || !sleep(backoff)) {
                break;
            }
            backoff *= 2;
        }

        log.error("No price available for {} after {} attempts", symbol, maxAttempts);
        return Optional.empty();
    }

    public Map<String, Quote> fetchQuotes(List<String> symbols) {
        if (symbols.isEmpty()) {
            return Map.of();
        }
        // One HTTP call regardless of how many symbols (up to 25) are in
        // it - that's the whole quota-saving point of batching. No internal
        // retry loop here: this isn't on the order-fill path, so a failed
        // poll just tries again next scheduled tick rather than spending a
        // retry budget on data that will be re-polled shortly anyway.
        try {
            String joined = String.join(",", symbols);
            FauxnanceBatchQuotesEnvelope envelope = restClient.get()
                    .uri("/quotes?symbols={symbols}", joined)
                    .retrieve()
                    .body(FauxnanceBatchQuotesEnvelope.class);

            if (envelope == null || envelope.data() == null || envelope.data().quotes() == null) {
                return Map.of();
            }
            Map<String, Quote> result = new LinkedHashMap<>();
            for (FauxnanceBatchQuoteItem item : envelope.data().quotes()) {
                if (item.quote() != null) {
                    FauxnanceQuoteDetail detail = item.quote();
                    result.put(item.symbol(), new Quote(detail.symbol(), detail.bid(), detail.ask(), detail.currency()));
                }
            }
            return result;
        } catch (RestClientException e) {
            log.warn("Batch quote fetch failed for {} symbols: {}", symbols.size(), e.getMessage());
            return Map.of();
        }
    }

    private Quote fetchOnce(String symbol) {
        FauxnanceQuoteEnvelope envelope = restClient.get()
                .uri("/quotes/{symbol}", symbol)
                .retrieve()
                .body(FauxnanceQuoteEnvelope.class);

        if (envelope == null || envelope.data() == null || envelope.data().quote() == null) {
            return null;
        }
        FauxnanceQuoteDetail detail = envelope.data().quote();
        return new Quote(detail.symbol(), detail.bid(), detail.ask(), detail.currency());
    }

    private boolean sleep(long millis) {
        try {
            Thread.sleep(millis);
            return true;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }
}
