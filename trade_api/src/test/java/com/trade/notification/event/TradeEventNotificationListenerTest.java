package com.trade.notification.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trade.notification.enums.NotificationEventType;
import com.trade.notification.service.NotificationService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

// The notifications module's Kafka entry point, against the event the executor really publishes.
// What happens next (the customer's settings, storing, delivery) is NotificationServiceTest's.
class TradeEventNotificationListenerTest {

    private static final UUID EVENT = UUID.fromString("aaaaaaaa-0000-4000-8000-000000000001");

    private final NotificationService service = mock(NotificationService.class);
    private final TradeEventNotificationListener listener =
            new TradeEventNotificationListener(new ObjectMapper(), service);

    private static String event(String type) {
        return """
                {"eventId":"%s","eventType":"%s","source":"trade-executor","payload":
                 {"orderId":"ORD-1","accountId":7,"symbol":"AAPL"}}""".formatted(EVENT, type);
    }

    @Test
    @DisplayName("a fill becomes a notification for the account that owns the order")
    void filled() {
        listener.onTradeEvent(event("ORDER_FILLED"));

        verify(service).notify(7L, EVENT, NotificationEventType.ORDER_FILLED, "ORD-1", "AAPL", null);
    }

    @Test
    @DisplayName("a rejection becomes one too")
    void rejected() {
        listener.onTradeEvent(event("ORDER_REJECTED"));

        verify(service).notify(7L, EVENT, NotificationEventType.ORDER_REJECTED, "ORD-1", "AAPL", null);
    }

    @Test
    @DisplayName("events that are not an order outcome, and unreadable or incomplete messages, are ignored without an error")
    void otherEventsAreIgnored() {
        listener.onTradeEvent(event("ORDER_PARTIALLY_FILLED"));
        listener.onTradeEvent("not json at all");
        listener.onTradeEvent("""
                {"eventId":"%s","eventType":"ORDER_FILLED","payload":{"symbol":"AAPL"}}""".formatted(EVENT));

        verify(service, never()).notify(anyLong(), any(), any(), any(), any(), isNull());
    }
}
