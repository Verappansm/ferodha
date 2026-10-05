package com.trade.executor.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trade.executor.fauxnance.Quote;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;

// One message per symbol, keyed by symbol - never one message per batch.
// Batching the HTTP call to Fauxnance is a quota optimisation; batching the
// Kafka message would put several symbols behind one key and destroy the
// per-symbol ordering the contract promises for market-data. Fire-and-forget
// send, like trade_api's own ORDER_PLACED publish - a missed market-data
// tick isn't a business outcome anything needs to know failed, unlike a
// trade-events publish that gates whether the consumer offset is acked.
@Component
public class MarketDataPublisher {

    private static final Logger log = LoggerFactory.getLogger(MarketDataPublisher.class);

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final String marketDataTopic;

    public MarketDataPublisher(KafkaTemplate<String, String> kafkaTemplate, ObjectMapper objectMapper,
                                @Value("${kafka.topics.market-data:market-data}") String marketDataTopic) {
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
        this.marketDataTopic = marketDataTopic;
    }

    public void publishQuote(String symbol, Quote quote) {
        MarketDataQuotePayload payload = new MarketDataQuotePayload(
                symbol, quote.bid(), quote.ask(), quote.currency(), Instant.now());
        EventEnvelope<MarketDataQuotePayload> envelope = EventEnvelope.of("MARKET_DATA_QUOTE", "trade-executor", payload);
        try {
            String json = objectMapper.writeValueAsString(envelope);
            kafkaTemplate.send(marketDataTopic, symbol, json);
        } catch (Exception e) {
            log.warn("Failed to publish market-data quote for {}: {}", symbol, e.getMessage());
        }
    }
}
