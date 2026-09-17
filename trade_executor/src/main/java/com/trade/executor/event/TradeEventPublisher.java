package com.trade.executor.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trade.executor.domain.OrderIdCodec;
import com.trade.executor.domain.RejectionReason;
import com.trade.executor.mapper.OrderRow;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;

// Publishes ORDER_FILLED / ORDER_REJECTED to trade-events, keyed by
// accountId (same key scheme as the orders topic, so per-account ordering
// holds across both). Sends synchronously and blocks on the broker's ack -
// deliberately unlike trade_api's fire-and-forget send on the orders topic,
// because Story 2 requires the listener to know the publish actually
// succeeded before it acknowledges the ORDER_PLACED offset.
@Component
public class TradeEventPublisher {

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final String tradeEventsTopic;
    private final Duration sendTimeout;

    public TradeEventPublisher(KafkaTemplate<String, String> kafkaTemplate,
                                ObjectMapper objectMapper,
                                @Value("${kafka.topics.trade-events:trade-events}") String tradeEventsTopic,
                                @Value("${executor.publish.timeout-ms:5000}") long sendTimeoutMs) {
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
        this.tradeEventsTopic = tradeEventsTopic;
        this.sendTimeout = Duration.ofMillis(sendTimeoutMs);
    }

    public void publishFilled(OrderRow order, BigDecimal executedPrice, BigDecimal feeAmount) {
        OrderFilledPayload payload = new OrderFilledPayload(
                OrderIdCodec.format(order.orderId()), order.accountId(), order.symbol(),
                executedPrice, feeAmount, Instant.now());
        send(order.accountId(), EventEnvelope.of("ORDER_FILLED", "trade-executor", payload));
    }

    public void publishRejected(OrderRow order, RejectionReason reason) {
        OrderRejectedPayload payload = new OrderRejectedPayload(
                OrderIdCodec.format(order.orderId()), order.accountId(), order.symbol(),
                reason.name(), Instant.now());
        send(order.accountId(), EventEnvelope.of("ORDER_REJECTED", "trade-executor", payload));
    }

    private void send(Long accountId, EventEnvelope<?> envelope) {
        try {
            String json = objectMapper.writeValueAsString(envelope);
            // Blocking get(): a failed or timed-out publish must throw here
            // so the listener does not acknowledge the offset.
            kafkaTemplate.send(tradeEventsTopic, String.valueOf(accountId), json).get(
                    sendTimeout.toMillis(), java.util.concurrent.TimeUnit.MILLISECONDS);
        } catch (Exception e) {
            throw new TradeEventPublishException(envelope.eventType(), accountId, e);
        }
    }
}
