package com.trade.notification.event;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.trade.notification.dto.RecordNotificationRequestDto;
import com.trade.notification.enums.NotificationEventType;
import com.trade.notification.service.NotificationService;
import com.trade.preferences.PreferenceDtos.AlertType;
import com.trade.preferences.PreferencesService;
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
    private final PreferencesService preferences;

    public TradeEventNotificationListener(ObjectMapper objectMapper, NotificationService notificationService,
                                          PreferencesService preferences) {
        this.objectMapper = objectMapper;
        this.notificationService = notificationService;
        this.preferences = preferences;
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

            // The customer's own settings decide whether they hear about this kind of
            // event at all (Settings > notify on filled / rejected / cancelled).
            if (!preferences.resolveChannel(accountId, AlertType.valueOf(notificationEventType.name())).deliver()) {
                log.debug("Account {} turned {} alerts off - no notification for event {}",
                        accountId, notificationEventType, eventId);
                return;
            }

            // Record notification (idempotent on eventId)
            try {
                notificationService.recordNotification(accountId, eventId, notificationEventType, orderId, symbol);
                log.debug("Recorded notification for {} event: {}", eventType, eventId);
            } catch (IllegalArgumentException e) {
                if (e.getMessage().contains("already recorded")) {
                    log.debug("Idempotent duplicate: notification already recorded for event {}", eventId);
                    // Still return success to allow offset to be committed
                } else {
                    throw e;
                }
            }
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
