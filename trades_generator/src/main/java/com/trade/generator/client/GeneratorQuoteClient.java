package com.trade.generator.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.trade.generator.fauxnance.Quote;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.math.BigDecimal;
import java.util.Optional;

// Reads the live tick from the pricing service instead of an in-process
// store: after the pricing migration this service no longer generates ticks
// itself, so OrderGenerator prices off pricing-generator's QuoteController
// (GET /api/v1/quotes/{symbol}) - the same value trade_executor already
// reads under the market-sim profile. A missing tick (no anchor/bounds yet
// on the pricing side, or a failed call) resolves to empty so the caller
// skips the symbol for this cycle rather than guessing - identical to the
// old "no tick yet" behaviour.
@Component
public class GeneratorQuoteClient {

    private static final Logger log = LoggerFactory.getLogger(GeneratorQuoteClient.class);

    private final RestClient restClient;

    public GeneratorQuoteClient(@Qualifier("generatorRestClient") RestClient restClient) {
        this.restClient = restClient;
    }

    public Optional<Quote> fetchQuote(String symbol) {
        try {
            QuoteView view = restClient.get()
                    .uri("/api/v1/quotes/{symbol}", symbol)
                    .retrieve()
                    .body(QuoteView.class);
            return toQuote(view);
        } catch (RestClientException e) {
            log.warn("pricing quote call for {} failed: {}", symbol, e.getMessage());
            return Optional.empty();
        }
    }

    private static Optional<Quote> toQuote(QuoteView view) {
        if (view == null || view.bid() == null || view.ask() == null) {
            return Optional.empty();
        }
        return Optional.of(new Quote(view.symbol(), view.bid(), view.ask(), view.currency()));
    }

    // Mirrors pricing-generator's own com.trade.pricing.generator.fauxnance.Quote
    // shape exactly - the two are separate Maven projects, copy not depend,
    // same convention as every other cross-service DTO in this repo.
    @JsonIgnoreProperties(ignoreUnknown = true)
    private record QuoteView(String symbol, BigDecimal bid, BigDecimal ask, String currency) {
    }
}
