package com.trade.watchlist;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;

/**
 * The watchlist module's own consumer of market-data (Sprint 10: alerts are raised from the
 * quote stream). Its group id is its own, so its offsets never move another module's. It
 * starts from the latest offset: an alert is about the price now, and replaying old quotes
 * would fire alerts the market has already left behind.
 */
@Component
public class PriceAlertListener {

    private static final Logger log = LoggerFactory.getLogger(PriceAlertListener.class);

    private final ObjectMapper objectMapper;
    private final PriceAlertEvaluator evaluator;
    private final Duration maxQuoteAge;

    public PriceAlertListener(ObjectMapper objectMapper, PriceAlertEvaluator evaluator,
                              @Value("${watchlist.alerts.max-quote-age-seconds:900}") long maxQuoteAgeSeconds) {
        this.objectMapper = objectMapper;
        this.evaluator = evaluator;
        this.maxQuoteAge = Duration.ofSeconds(maxQuoteAgeSeconds);
    }

    @KafkaListener(topics = "${kafka.topics.market-data:market-data}",
            groupId = "${watchlist.alerts.group-id:watchlist-alerts}",
            autoStartup = "${watchlist.alerts.listen:true}",
            properties = "auto.offset.reset=latest")
    public void onQuote(String message) {
        try {
            JsonNode payload = objectMapper.readTree(message).path("payload");
            String symbol = payload.path("symbol").asText(null);
            BigDecimal price = mid(decimal(payload.path("bid")), decimal(payload.path("ask")));
            if (symbol == null || price == null || isOld(payload.path("asOf"))) {
                return;
            }
            evaluator.evaluate(symbol.trim().toUpperCase(), price);
        } catch (Exception e) {
            // A quote that cannot be read is skipped: the next one is seconds away.
            log.debug("Skipping market-data message for alerts: {}", e.getMessage());
        }
    }

    private boolean isOld(JsonNode asOf) {
        if (asOf.isMissingNode() || asOf.isNull()) {
            return false;
        }
        Instant observed = asOf.isNumber()
                ? Instant.ofEpochMilli(asOf.decimalValue().movePointRight(3).longValue())
                : OffsetDateTime.parse(asOf.asText()).toInstant();
        return observed.isBefore(Instant.now().minus(maxQuoteAge));
    }

    private static BigDecimal decimal(JsonNode node) {
        return node.isNumber() || node.isTextual() ? new BigDecimal(node.asText()) : null;
    }

    private static BigDecimal mid(BigDecimal bid, BigDecimal ask) {
        if (bid != null && ask != null) {
            return bid.add(ask).divide(BigDecimal.valueOf(2), 4, RoundingMode.HALF_UP);
        }
        return bid != null ? bid : ask;
    }
}
