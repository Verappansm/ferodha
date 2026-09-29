package com.trade.event;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trade.mapper.OrderMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.util.UUID;

// Sends ORDER_PLACED to the orders topic, keyed by account, and records on the
// order row when Kafka acknowledges it. Used for a freshly placed order
// (OrderController) and for one whose first send never got through
// (UnpublishedOrderSweeper). A send that fails is logged and left for the
// sweeper; it never fails the HTTP request, because the order is already
// committed by then.
@Component
public class OrderPlacedPublisher {

    private static final Logger log = LoggerFactory.getLogger(OrderPlacedPublisher.class);

    // OrderService hands out order ids as "ORD-<uuid>".
    private static final String ORDER_ID_PREFIX = "ORD-";

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;
    private final OrderMapper orderMapper;
    private final String orderTopic;

    public OrderPlacedPublisher(KafkaTemplate<String, String> kafkaTemplate,
                                ObjectMapper objectMapper,
                                OrderMapper orderMapper,
                                @Value("${kafka.topics.orders:orders}") String orderTopic) {
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
        this.orderMapper = orderMapper;
        this.orderTopic = orderTopic;
    }

    public void publish(OrderPlacedPayload payload) {
        EventEnvelope<OrderPlacedPayload> envelope =
                EventEnvelope.of("ORDER_PLACED", "trade-api", payload);

        String json;
        try {
            json = objectMapper.writeValueAsString(envelope);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize ORDER_PLACED event for " + payload.orderId(), e);
        }

        UUID orderUuid = orderUuidOf(payload.orderId());
        kafkaTemplate.send(orderTopic, String.valueOf(payload.accountId()), json)
                .whenComplete((result, error) -> {
                    if (error == null) {
                        orderMapper.markPublished(orderUuid);
                    } else {
                        log.warn("ORDER_PLACED for {} was not acknowledged; the sweeper will resend it: {}",
                                payload.orderId(), error.getMessage());
                    }
                });
    }

    static UUID orderUuidOf(String orderId) {
        String raw = orderId.startsWith(ORDER_ID_PREFIX) ? orderId.substring(ORDER_ID_PREFIX.length()) : orderId;
        return UUID.fromString(raw);
    }
}
