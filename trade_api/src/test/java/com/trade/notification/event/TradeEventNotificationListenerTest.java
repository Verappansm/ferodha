package com.trade.notification.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.trade.notification.enums.NotificationEventType;
import com.trade.notification.service.NotificationService;
import com.trade.preferences.PreferenceDtos.AlertType;
import com.trade.preferences.PreferenceDtos.ChannelRoute;
import com.trade.preferences.PreferenceDtos.NotificationChannel;
import com.trade.preferences.PreferencesService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

// The notifications module's Kafka entry point, against the event the executor really publishes.
class TradeEventNotificationListenerTest {

    private static final UUID EVENT = UUID.fromString("aaaaaaaa-0000-4000-8000-000000000001");

    private final NotificationService service = mock(NotificationService.class);
    private final PreferencesService preferences = mock(PreferencesService.class);
    private final TradeEventNotificationListener listener =
            new TradeEventNotificationListener(new ObjectMapper(), service, preferences);

    private static String event(String type) {
        return """
                {"eventId":"%s","eventType":"%s","source":"trade-executor","payload":
                 {"orderId":"ORD-1","accountId":7,"symbol":"AAPL"}}""".formatted(EVENT, type);
    }

    private void customerWants(AlertType type, boolean deliver) {
        when(preferences.resolveChannel(7L, type)).thenReturn(
                new ChannelRoute(deliver, NotificationChannel.IN_APP, null, ChannelRoute.Source.STORED));
    }

    @Test
    @DisplayName("a fill is recorded as a notification for the account that owns the order")
    void filledIsRecorded() throws Exception {
        customerWants(AlertType.ORDER_FILLED, true);

        listener.onTradeEvent(event("ORDER_FILLED"));

        verify(service).recordNotification(7L, EVENT, NotificationEventType.ORDER_FILLED, "ORD-1", "AAPL");
    }

    @Test
    @DisplayName("a rejection is recorded too")
    void rejectedIsRecorded() throws Exception {
        customerWants(AlertType.ORDER_REJECTED, true);

        listener.onTradeEvent(event("ORDER_REJECTED"));

        verify(service).recordNotification(7L, EVENT, NotificationEventType.ORDER_REJECTED, "ORD-1", "AAPL");
    }

    @Test
    @DisplayName("an alert type the customer turned off in Settings is not recorded")
    void switchedOffIsSkipped() throws Exception {
        customerWants(AlertType.ORDER_FILLED, false);

        listener.onTradeEvent(event("ORDER_FILLED"));

        verify(service, never()).recordNotification(anyLong(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("events that are not an order outcome, and unreadable messages, are ignored without an error")
    void otherEventsAreIgnored() throws Exception {
        listener.onTradeEvent(event("ORDER_PARTIALLY_FILLED"));
        listener.onTradeEvent("not json at all");
        listener.onTradeEvent("""
                {"eventId":"%s","eventType":"ORDER_FILLED","payload":{"symbol":"AAPL"}}""".formatted(EVENT));

        verify(service, never()).recordNotification(anyLong(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("a redelivered event that was already recorded is not an error")
    void duplicateIsQuiet() throws Exception {
        customerWants(AlertType.ORDER_FILLED, true);
        when(service.recordNotification(eq(7L), eq(EVENT), any(), any(), any()))
                .thenThrow(new IllegalArgumentException("Notification already recorded for this event"));

        listener.onTradeEvent(event("ORDER_FILLED"));
    }
}
