package com.trade.notification.event;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trade.notification.dto.RecordNotificationRequestDto;
import com.trade.notification.enums.NotificationEventType;
import com.trade.notification.service.NotificationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import java.util.UUID;

/**
 * Consumes trade-events from Kafka and records notifications for filled, rejected,
 * and cancelled orders. Idempotent on eventId: a replayed event produces no second
 * notification. Offset is committed only after the notification is durably recorded
 * in the database.
 */
@Component
public class TradeEventNotificationListener {

    private static final Logger log = LoggerFactory.getLogger(TradeEventNotificationListener.class);

    private final ObjectMapper objectMapper;
    private final NotificationService notificationService;

    public TradeEventNotificationListener(ObjectMapper objectMapper, NotificationService notificationService) {
        this.objectMapper = objectMapper;
        this.notificationService = notificationService;
    }

    @KafkaListener(
            topics = "${kafka.topics.trade-events:trade-events}",
            groupId = "${notification.group-id:notification-consumer}",
            autoStartup = "${notification.listen:true}",
            properties = "auto.offset.reset=earliest"
    )
    public void onTradeEvent(String message) {
        try {
            JsonNode root = objectMapper.readTree(message);
            String eventType = root.path("eventType").asText("");

            // Only process order outcomes
            if (!isOrderOutcome(eventType)) {
                return;
            }

            // Extract envelope
            UUID eventId = UUID.fromString(root.path("eventId").asText(""));
            JsonNode payload = root.path("payload");

            Long accountId = payload.path("accountId").asLong(-1);
            String orderId = payload.path("orderId").asText(null);
            String symbol = payload.path("symbol").asText(null);

            if (accountId <= 0 || orderId == null || symbol == null) {
                log.warn("Skipping incomplete trade-event: accountId={}, orderId={}, symbol={}", accountId, orderId, symbol);
                return;
            }

            // Map to notification event type
            NotificationEventType notificationEventType = mapEventType(eventType);

            // The service applies the customer's settings, stores it once per event, and delivers it.
            notificationService.notify(accountId, eventId, notificationEventType, orderId, symbol, null);
        } catch (Exception e) {
            log.error("Error processing trade-event for notification", e);
            // Do not crash the consumer; malformed events are skipped and offset is committed
        }
    }

    private boolean isOrderOutcome(String eventType) {
        return eventType.equals("ORDER_FILLED") ||
               eventType.equals("ORDER_REJECTED") ||
               eventType.equals("ORDER_CANCELLED");
    }

    private NotificationEventType mapEventType(String eventType) {
        return switch (eventType) {
            case "ORDER_FILLED" -> NotificationEventType.ORDER_FILLED;
            case "ORDER_REJECTED" -> NotificationEventType.ORDER_REJECTED;
            case "ORDER_CANCELLED" -> NotificationEventType.ORDER_CANCELLED;
            default -> throw new IllegalArgumentException("Unknown event type: " + eventType);
        };
    }
}
