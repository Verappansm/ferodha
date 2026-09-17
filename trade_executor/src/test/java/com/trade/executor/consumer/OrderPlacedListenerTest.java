package com.trade.executor.consumer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trade.executor.domain.OrderExecutionService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.support.Acknowledgment;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

// Story 7: a message that will never succeed must be recognisable as
// PoisonMessageException (wired as non-retryable in KafkaConsumerConfig)
// and, critically, must never reach ack.acknowledge() - an unacknowledged
// poison record is exactly what lets DefaultErrorHandler's recoverer send
// it to the DLT instead of it being silently treated as processed.
class OrderPlacedListenerTest {

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
    private final OrderExecutionService orderExecutionService = mock(OrderExecutionService.class);
    private final OrderPlacedListener listener = new OrderPlacedListener(objectMapper, orderExecutionService);

    @Test
    @DisplayName("a malformed message is dead-lettered on the first attempt (never acknowledged, never retried)")
    void malformedJsonIsPoison() {
        Acknowledgment ack = mock(Acknowledgment.class);

        assertThrows(PoisonMessageException.class, () -> listener.onMessage("{not-json", ack));

        verify(ack, never()).acknowledge();
    }

    @Test
    @DisplayName("an unexpected event type on the orders topic is poison")
    void unexpectedEventTypeIsPoison() {
        Acknowledgment ack = mock(Acknowledgment.class);
        String raw = """
                {"eventId":"11111111-1111-1111-1111-111111111111","eventType":"SOMETHING_ELSE",
                 "eventTime":"2024-01-01T00:00:00Z","source":"trade-api","schemaVersion":1,
                 "payload":{"orderId":"ORD-11111111-1111-1111-1111-111111111111","accountId":1}}
                """;

        assertThrows(PoisonMessageException.class, () -> listener.onMessage(raw, ack));

        verify(ack, never()).acknowledge();
    }

    @Test
    @DisplayName("a missing order id is poison")
    void missingOrderIdIsPoison() {
        Acknowledgment ack = mock(Acknowledgment.class);
        String raw = """
                {"eventId":"11111111-1111-1111-1111-111111111111","eventType":"ORDER_PLACED",
                 "eventTime":"2024-01-01T00:00:00Z","source":"trade-api","schemaVersion":1,
                 "payload":{"accountId":1}}
                """;

        assertThrows(PoisonMessageException.class, () -> listener.onMessage(raw, ack));

        verify(ack, never()).acknowledge();
    }
}
