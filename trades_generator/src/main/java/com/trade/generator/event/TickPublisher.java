package com.trade.generator.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trade.generator.fauxnance.Quote;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;

// Publishes to the *existing* market-data topic, same envelope/payload
// shape trade_executor's own MarketDataPublisher already uses - this
// service's ticks and trade_executor's real polled quotes are
// indistinguishable to anything downstream, deliberately. Fire-and-forget,
// same reasoning as the original: a missed tick isn't a business outcome
// worth failing anything over.
@Component
public class TickPublisher {

    private static final Logger log = LoggerFactory.getLogger(TickPublisher.class);

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final String marketDataTopic;

    public TickPublisher(KafkaTemplate<String, String> kafkaTemplate, ObjectMapper objectMapper,
                          @Value("${kafka.topics.market-data:market-data}") String marketDataTopic) {
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
        this.marketDataTopic = marketDataTopic;
    }

    public void publishTick(String symbol, Quote quote) {
        MarketDataQuotePayload payload = new MarketDataQuotePayload(
                symbol, quote.bid(), quote.ask(), quote.currency(), Instant.now());
        EventEnvelope<MarketDataQuotePayload> envelope = EventEnvelope.of("MARKET_DATA_QUOTE", "trades-generator", payload);
        try {
            String json = objectMapper.writeValueAsString(envelope);
            kafkaTemplate.send(marketDataTopic, symbol, json);
        } catch (Exception e) {
            log.warn("Failed to publish tick for {}: {}", symbol, e.getMessage());
        }
    }
}
