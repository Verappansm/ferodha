package com.trade.executor.consumer;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JavaType;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trade.executor.domain.OrderExecutionService;
import com.trade.executor.event.EventEnvelope;
import com.trade.executor.event.OrderPlacedPayload;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

@Component
public class OrderPlacedListener {

    private static final Logger log = LoggerFactory.getLogger(OrderPlacedListener.class);

    private final ObjectMapper objectMapper;
    private final OrderExecutionService orderExecutionService;

    public OrderPlacedListener(ObjectMapper objectMapper, OrderExecutionService orderExecutionService) {
        this.objectMapper = objectMapper;
        this.orderExecutionService = orderExecutionService;
    }

    @KafkaListener(topics = "${kafka.topics.orders:orders}",
            groupId = "trade-executor",
            containerFactory = "manualAckOrdersListenerFactory")
    public void onMessage(String raw, Acknowledgment ack) {
        // Logged at receipt specifically so the exact envelope can be
        // captured and replayed verbatim for the duplicate-idempotency demo.
        log.info("Received ORDER_PLACED: {}", raw);

        OrderPlacedPayload payload = parse(raw);
        // Business outcomes never throw out of process(); only malformed
        // input (parse()) or a genuine infra fault propagates past here, to
        // DefaultErrorHandler's retry-then-orders.DLT path - the offset is
        // acknowledged only once settlement (or its already-processed
        // no-op) and any required publish have both completed.
        orderExecutionService.process(payload);
        ack.acknowledge();
    }

    private static final String EXPECTED_EVENT_TYPE = "ORDER_PLACED";

    private OrderPlacedPayload parse(String raw) {
        EventEnvelope<OrderPlacedPayload> envelope;
        try {
            JavaType envelopeType = objectMapper.getTypeFactory()
                    .constructParametricType(EventEnvelope.class, OrderPlacedPayload.class);
            envelope = objectMapper.readValue(raw, envelopeType);
        } catch (JsonProcessingException e) {
            // Malformed JSON will never parse no matter how many times it's
            // retried - dead-letter on the first attempt.
            throw new PoisonMessageException("Malformed ORDER_PLACED message", e);
        }
        if (!EXPECTED_EVENT_TYPE.equals(envelope.eventType())) {
            throw new PoisonMessageException("Unexpected event type on orders topic: " + envelope.eventType());
        }
        if (envelope.payload() == null || envelope.payload().orderId() == null) {
            throw new PoisonMessageException("ORDER_PLACED message is missing an order id");
        }
        return envelope.payload();
    }
}
