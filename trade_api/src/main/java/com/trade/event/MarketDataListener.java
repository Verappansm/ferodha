package com.trade.event;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trade.service.portfolio.LatestQuotes;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

// Feeds LatestQuotes from market-data. Both producers (trade-executor's
// poller, and pricing_generator under market-sim) send the same envelope
// with a {symbol, bid, ask, currency, asOf} payload.
//
// The group id is unique per process start and the offset reset is
// earliest, so every start re-reads the topic's retained quotes and the
// in-memory cache is warm again before the first portfolio request. A
// malformed message is skipped: a missed quote only means a stale price.
@Component
public class MarketDataListener {

    private static final Logger log = LoggerFactory.getLogger(MarketDataListener.class);

    private final ObjectMapper objectMapper;
    private final LatestQuotes latestQuotes;

    public MarketDataListener(ObjectMapper objectMapper, LatestQuotes latestQuotes) {
        this.objectMapper = objectMapper;
        this.latestQuotes = latestQuotes;
    }

    @KafkaListener(topics = "${kafka.topics.market-data:market-data}",
            groupId = "${portfolio.quotes.group-id}",
            autoStartup = "${portfolio.quotes.listen:true}",
            properties = "auto.offset.reset=earliest")
    public void onQuote(String message) {
        try {
            JsonNode payload = objectMapper.readTree(message).path("payload");
            String symbol = payload.path("symbol").asText(null);
            BigDecimal price = midPrice(payload.path("bid"), payload.path("ask"));
            OffsetDateTime asOf = observedAt(payload.path("asOf"));
            if (symbol == null || price == null) {
                log.debug("Skipping market-data message without a symbol or a price");
                return;
            }
            latestQuotes.record(symbol, price, asOf);
        } catch (Exception e) {
            log.debug("Skipping unreadable market-data message: {}", e.getMessage());
        }
    }

    // An Instant serialises as an ISO string, or as epoch seconds when a
    // producer's ObjectMapper writes dates as timestamps.
    private static OffsetDateTime observedAt(JsonNode asOf) {
        if (asOf.isNumber()) {
            BigDecimal seconds = asOf.decimalValue();
            long whole = seconds.longValue();
            long nanos = seconds.subtract(BigDecimal.valueOf(whole)).movePointRight(9).longValue();
            return Instant.ofEpochSecond(whole, nanos).atOffset(ZoneOffset.UTC);
        }
        return OffsetDateTime.parse(asOf.asText());
    }

    // Values a holding at the mid of the quote; one missing side falls back
    // to the other.
    private static BigDecimal midPrice(JsonNode bid, JsonNode ask) {
        BigDecimal b = bid.isNumber() ? bid.decimalValue() : null;
        BigDecimal a = ask.isNumber() ? ask.decimalValue() : null;
        if (b != null && a != null) {
            return b.add(a).divide(BigDecimal.valueOf(2), 4, RoundingMode.HALF_UP);
        }
        return b != null ? b : a;
    }
}
