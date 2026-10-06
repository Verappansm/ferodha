package com.trade.strategy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

// The strategy engine's two inputs, both under the consumer group
// strategy-service: quotes from market-data (what to evaluate) and outcomes
// from trade-events (what happened to the orders it placed). A malformed
// message is skipped, never retried: a missed quote only delays a crossing.
@Component
public class StrategyListener {

    private static final Logger log = LoggerFactory.getLogger(StrategyListener.class);

    private final StrategyEngine engine;
    private final ObjectMapper objectMapper;

    public StrategyListener(StrategyEngine engine, ObjectMapper objectMapper) {
        this.engine = engine;
        this.objectMapper = objectMapper;
    }

    @KafkaListener(topics = "${kafka.topics.market-data:market-data}",
            groupId = "${strategy.group-id:strategy-service}",
            autoStartup = "${strategy.listen:true}",
            properties = "auto.offset.reset=latest")
    public void onQuote(String message) {
        try {
            JsonNode payload = objectMapper.readTree(message).path("payload");
            String symbol = payload.path("symbol").asText(null);
            BigDecimal bid = decimal(payload.path("bid"));
            BigDecimal ask = decimal(payload.path("ask"));
            if (symbol == null || (bid == null && ask == null)) {
                return;
            }
            engine.onQuote(symbol, bid, ask, observedAt(payload.path("asOf")));
        } catch (Exception e) {
            log.debug("Skipping unreadable market-data message: {}", e.getMessage());
        }
    }

    @KafkaListener(topics = "${kafka.topics.trade-events:trade-events}",
            groupId = "${strategy.group-id:strategy-service}",
            autoStartup = "${strategy.listen:true}",
            properties = "auto.offset.reset=latest")
    public void onTradeEvent(String message) {
        try {
            JsonNode root = objectMapper.readTree(message);
            JsonNode payload = root.path("payload");
            String orderId = payload.path("orderId").asText(null);
            switch (root.path("eventType").asText("")) {
                case "ORDER_REJECTED" -> engine.onOrderRejected(orderId, payload.path("rejectionReason").asText(""));
                case "ORDER_FILLED" -> engine.onOrderFilled(orderId);
                default -> { }
            }
        } catch (Exception e) {
            log.debug("Skipping unreadable trade-events message: {}", e.getMessage());
        }
    }

    // An Instant serialises as an ISO string, or as epoch seconds when the
    // producer writes dates as timestamps.
    private static OffsetDateTime observedAt(JsonNode asOf) {
        if (asOf.isNumber()) {
            BigDecimal seconds = asOf.decimalValue();
            long whole = seconds.longValue();
            long nanos = seconds.subtract(BigDecimal.valueOf(whole)).movePointRight(9).longValue();
            return Instant.ofEpochSecond(whole, nanos).atOffset(ZoneOffset.UTC);
        }
        return OffsetDateTime.parse(asOf.asText());
    }

    private static BigDecimal decimal(JsonNode node) {
        return node.isNumber() ? node.decimalValue() : null;
    }
}
