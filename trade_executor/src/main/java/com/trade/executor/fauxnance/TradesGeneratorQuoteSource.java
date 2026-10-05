package com.trade.executor.fauxnance;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

// The other QuoteSource implementation - active only under market-sim (see
// FauxnanceQuoteClient's own @Profile for the other half of this pairing).
// Calls trades_generator's own quote endpoint instead of Fauxnance
// directly; that service is the one actually holding FAUXNANCE_API_KEY and
// calibrating against real quotes/candles under this profile. This class
// never talks to Fauxnance itself.
@Component
@Profile("market-sim")
public class TradesGeneratorQuoteSource implements QuoteSource {

    private static final Logger log = LoggerFactory.getLogger(TradesGeneratorQuoteSource.class);

    private final RestClient restClient;

    public TradesGeneratorQuoteSource(@Qualifier("tradesGeneratorRestClient") RestClient restClient) {
        this.restClient = restClient;
    }

    @Override
    public Optional<Quote> fetchQuote(String symbol) {
        try {
            QuoteView view = restClient.get()
                    .uri("/api/v1/quotes/{symbol}", symbol)
                    .retrieve()
                    .body(QuoteView.class);
            return toQuote(view);
        } catch (RestClientException e) {
            log.warn("trades-generator quote call for {} failed: {}", symbol, e.getMessage());
            return Optional.empty();
        }
    }

    @Override
    public Map<String, Quote> fetchQuotes(List<String> symbols) {
        if (symbols.isEmpty()) {
            return Map.of();
        }
        try {
            String joined = String.join(",", symbols);
            Map<String, QuoteView> raw = restClient.get()
                    .uri("/api/v1/quotes?symbols={symbols}", joined)
                    .retrieve()
                    .body(new ParameterizedTypeReference<Map<String, QuoteView>>() {
                    });
            Map<String, Quote> result = new LinkedHashMap<>();
            if (raw != null) {
                raw.forEach((symbol, view) -> toQuote(view).ifPresent(quote -> result.put(symbol, quote)));
            }
            return result;
        } catch (RestClientException e) {
            log.warn("trades-generator batch quote call for {} symbols failed: {}", symbols.size(), e.getMessage());
            return Map.of();
        }
    }

    private static Optional<Quote> toQuote(QuoteView view) {
        if (view == null || view.bid() == null || view.ask() == null) {
            return Optional.empty();
        }
        return Optional.of(new Quote(view.symbol(), view.bid(), view.ask(), view.currency()));
    }

    // Mirrors trades_generator's own com.trade.generator.fauxnance.Quote
    // shape exactly - the two are separate Maven projects, copy not depend,
    // same convention as every other cross-service DTO in this repo.
    @JsonIgnoreProperties(ignoreUnknown = true)
    private record QuoteView(String symbol, BigDecimal bid, BigDecimal ask, String currency) {
    }
}
