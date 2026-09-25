package com.trade.executor.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trade.executor.fauxnance.Quote;
import com.trade.executor.fauxnance.QuoteSource;
import com.trade.executor.mapper.ExecutorMapperIntegrationTestSupport;
import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.clients.consumer.ConsumerRecords;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.test.EmbeddedKafkaBroker;
import org.springframework.kafka.test.utils.KafkaTestUtils;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

// End-to-end against the real OrderPlacedListener/OrderExecutionService/
// SettlementService wiring - only the Fauxnance HTTP call is swapped for a
// FakeQuoteSource covering a fill, a reject and a pricing-unavailable
// response, exactly as storeis.txt's Story 1 integration test asks for.
class OrderExecutorIT extends ExecutorMapperIntegrationTestSupport {

    @TestConfiguration
    static class FakeQuoteSourceConfig {

        @Bean
        @Primary
        QuoteSource fakeQuoteSource() {
            return new QuoteSource() {
                @Override
                public Optional<Quote> fetchQuote(String symbol) {
                    return switch (symbol) {
                        case "FILL_ME" -> Optional.of(new Quote("FILL_ME", new BigDecimal("99.00"), new BigDecimal("100.00"), "USD"));
                        case "REJECT_ME" -> Optional.of(new Quote("REJECT_ME", new BigDecimal("200.00"), new BigDecimal("210.00"), "USD"));
                        default -> Optional.empty(); // NO_PRICE, and anything unrecognized
                    };
                }

                @Override
                public java.util.Map<String, Quote> fetchQuotes(java.util.List<String> symbols) {
                    return java.util.Map.of();
                }
            };
        }
    }

    @Autowired
    private KafkaTemplate<String, String> kafkaTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private EmbeddedKafkaBroker embeddedKafkaBroker;

    @Value("${kafka.topics.orders:orders}")
    private String ordersTopic;

    @Value("${kafka.topics.trade-events:trade-events}")
    private String tradeEventsTopic;

    @Test
    @DisplayName("consumes ORDER_PLACED, prices, decides, settles and publishes for a fill, a reject and a pricing-unavailable order")
    void consumesPricesDecidesAndSettlesThreeOrders() throws Exception {
        long accountId = insertAccount("executor-it@example.com", "BANK-EXEC-IT-1", new BigDecimal("10000.00"), "USD");

        UUID fillInstrument = insertTradableInstrument("FILL_ME", "USD");
        UUID rejectInstrument = insertTradableInstrument("REJECT_ME", "USD");
        UUID noPriceInstrument = insertTradableInstrument("NO_PRICE", "USD");

        // limit 100.00 >= ask 100.00 -> fills
        UUID fillOrderId = insertNewOrder(accountId, fillInstrument, "BUY", 10, new BigDecimal("100.00"));
        // limit 100.00 < ask 210.00 -> not marketable
        UUID rejectOrderId = insertNewOrder(accountId, rejectInstrument, "BUY", 10, new BigDecimal("100.00"));
        // FakeQuoteSource returns empty for this symbol -> price unavailable
        UUID noPriceOrderId = insertNewOrder(accountId, noPriceInstrument, "BUY", 10, new BigDecimal("100.00"));

        publishOrderPlaced(fillOrderId, accountId, "FILL_ME", 10, new BigDecimal("100.00"));
        publishOrderPlaced(rejectOrderId, accountId, "REJECT_ME", 10, new BigDecimal("100.00"));
        publishOrderPlaced(noPriceOrderId, accountId, "NO_PRICE", 10, new BigDecimal("100.00"));

        awaitOrderStatus(fillOrderId, "FILLED");
        awaitOrderStatus(rejectOrderId, "REJECTED");
        awaitOrderStatus(noPriceOrderId, "REJECTED");

        assertEquals("NOT_MARKETABLE", jdbcTemplate.queryForObject(
                "SELECT rejection_reason FROM Orders WHERE order_id = ?::uuid", String.class, rejectOrderId.toString()));
        assertEquals("PRICE_UNAVAILABLE", jdbcTemplate.queryForObject(
                "SELECT rejection_reason FROM Orders WHERE order_id = ?::uuid", String.class, noPriceOrderId.toString()));

        // Only the fill moves cash: 10 x 100.00 trade value + 0.1% fee (1.00) = 1001.00 debited.
        BigDecimal balance = jdbcTemplate.queryForObject(
                "SELECT cash_balance FROM Accounts WHERE id = ?", BigDecimal.class, accountId);
        assertEquals(0, new BigDecimal("8999.00").compareTo(balance));

        assertExactlyThreeTradeEvents(accountId);
    }

    private void publishOrderPlaced(UUID orderId, long accountId, String symbol, int quantity, BigDecimal price)
            throws Exception {
        Map<String, Object> payload = Map.of(
                "orderId", "ORD-" + orderId,
                "accountId", accountId,
                "symbol", symbol,
                "side", "BUY",
                "quantity", quantity,
                "price", price,
                "idempotencyKey", "IT-KEY-" + orderId,
                "createdOn", Instant.now().toString());
        Map<String, Object> envelope = Map.of(
                "eventId", UUID.randomUUID().toString(),
                "eventType", "ORDER_PLACED",
                "eventTime", Instant.now().toString(),
                "source", "trade-api",
                "schemaVersion", 1,
                "payload", payload);

        kafkaTemplate.send(ordersTopic, String.valueOf(accountId), objectMapper.writeValueAsString(envelope))
                .get(10, TimeUnit.SECONDS);
    }

    private void awaitOrderStatus(UUID orderId, String expectedStatus) {
        long deadline = System.currentTimeMillis() + 15_000;
        String lastSeen = null;
        while (System.currentTimeMillis() < deadline) {
            lastSeen = jdbcTemplate.queryForObject(
                    "SELECT status FROM Orders WHERE order_id = ?::uuid", String.class, orderId.toString());
            if (expectedStatus.equals(lastSeen)) {
                return;
            }
            sleep(200);
        }
        fail("Order " + orderId + " did not reach " + expectedStatus + " in time (last seen: " + lastSeen + ")");
    }

    private void assertExactlyThreeTradeEvents(long accountId) {
        try (Consumer<String, String> consumer = createTradeEventsConsumer()) {
            List<ConsumerRecord<String, String>> records = new ArrayList<>();
            long deadline = System.currentTimeMillis() + 15_000;
            while (records.size() < 3 && System.currentTimeMillis() < deadline) {
                ConsumerRecords<String, String> polled = consumer.poll(Duration.ofMillis(500));
                polled.forEach(records::add);
            }

            assertEquals(3, records.size(), "expected exactly one trade-events message per order");

            Set<String> eventTypes = new HashSet<>();
            for (ConsumerRecord<String, String> record : records) {
                assertEquals(String.valueOf(accountId), record.key());
                JsonNode node = readTree(record.value());
                eventTypes.add(node.get("eventType").asText());
            }
            assertTrue(eventTypes.contains("ORDER_FILLED"));
            assertTrue(eventTypes.contains("ORDER_REJECTED"));
        }
    }

    private JsonNode readTree(String json) {
        try {
            return objectMapper.readTree(json);
        } catch (Exception e) {
            throw new IllegalStateException("Malformed trade-events message: " + json, e);
        }
    }

    private Consumer<String, String> createTradeEventsConsumer() {
        Map<String, Object> props = KafkaTestUtils.consumerProps("trade-events-it-group", "true", embeddedKafkaBroker);
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);

        Consumer<String, String> consumer = new DefaultKafkaConsumerFactory<String, String>(props).createConsumer();
        consumer.subscribe(Collections.singletonList(tradeEventsTopic));
        return consumer;
    }

    private void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
