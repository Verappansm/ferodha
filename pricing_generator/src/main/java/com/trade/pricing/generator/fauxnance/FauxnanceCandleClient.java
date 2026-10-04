package com.trade.pricing.generator.fauxnance;

import com.trade.pricing.generator.fauxnance.dto.FauxnanceCandle;
import com.trade.pricing.generator.fauxnance.dto.FauxnanceCandlesEnvelope;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

// Once a day per watched symbol: the day's high/low become the hard clamp
// RandomizerModel is never allowed to synthesize outside of. Requests a
// week's trailing window rather than just "today", because Fauxnance may
// not have published today's candle yet (market still open) - the most
// recent row in whatever comes back is treated as "today's" bounds. Never
// throws, same convention as FauxnanceQuoteClient: a failed refresh just
// means the previous day's bounds keep being used until the next attempt.
@Component
public class FauxnanceCandleClient {

    private static final Logger log = LoggerFactory.getLogger(FauxnanceCandleClient.class);

    private final RestClient restClient;

    public FauxnanceCandleClient(@Qualifier("fauxnanceRestClient") RestClient restClient) {
        this.restClient = restClient;
    }

    public Optional<FauxnanceCandle> fetchLatestCandle(String symbol) {
        LocalDate to = LocalDate.now();
        LocalDate from = to.minusDays(7);
        try {
            FauxnanceCandlesEnvelope envelope = restClient.get()
                    .uri("/candles/{symbol}?from={from}&to={to}&interval=1d", symbol, from, to)
                    .retrieve()
                    .body(FauxnanceCandlesEnvelope.class);

            if (envelope == null || envelope.data() == null) {
                return Optional.empty();
            }
            List<FauxnanceCandle> candles = envelope.data().candles();
            if (candles == null || candles.isEmpty()) {
                return Optional.empty();
            }
            return Optional.of(candles.get(candles.size() - 1));
        } catch (RestClientException e) {
            log.warn("Candle fetch failed for {}: {}", symbol, e.getMessage());
            return Optional.empty();
        }
    }

    /**
     * Fetch 1 year of historical daily candles for a symbol.
     * Used by CandlePersistenceScheduler to populate market_candles table.
     * Returns all candles returned by endpoint, or empty list if fetch fails.
     *
     * Endpoint: GET /candles/{symbol}
     * Header: X-Api-Key (configured globally in FauxnanceClientConfig)
     */
    public List<FauxnanceCandle> fetchCandlesByRange(String symbol) {
        try {
            FauxnanceCandlesEnvelope envelope = restClient.get()
                    .uri("/candles/{symbol}", symbol)
                    .retrieve()
                    .body(FauxnanceCandlesEnvelope.class);

            if (envelope == null || envelope.data() == null) {
                log.warn("No candle envelope returned for {}", symbol);
                return List.of();
            }
            List<FauxnanceCandle> candles = envelope.data().candles();
            if (candles == null) {
                log.warn("No candles in envelope for {}", symbol);
                return List.of();
            }
            log.info("Fetched {} candles for {}", candles.size(), symbol);
            return candles;
        } catch (RestClientException e) {
            log.warn("Candle fetch failed for {}: {}", symbol, e.getMessage());
            return List.of();
        }
    }
}
