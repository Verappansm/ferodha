package com.trade.notification.service;

import com.trade.notification.domain.Notification;
import com.trade.notification.domain.NotificationRepository;
import com.trade.notification.dto.NotificationResponseDto;
import com.trade.notification.enums.NotificationChannel;
import com.trade.notification.enums.NotificationEventType;
import com.trade.preferences.PreferenceDtos.AlertType;
import com.trade.preferences.PreferenceDtos.ChannelRoute;
import com.trade.preferences.PreferencesService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    private final NotificationRepository repository;
    private final PreferencesService preferences;
    private final NotificationDispatcher dispatcher;

    public NotificationService(NotificationRepository repository, PreferencesService preferences,
                               NotificationDispatcher dispatcher) {
        this.repository = repository;
        this.preferences = preferences;
        this.dispatcher = dispatcher;
    }

    /**
     * Get notifications for an account (paginated).
     */
    public List<NotificationResponseDto> getNotificationsByAccount(Long accountId, int limit, int offset) {
        List<Notification> notifications = repository.findByAccountIdOrderByCreatedDesc(accountId, limit, offset);
        return notifications.stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    /**
     * Count total notifications for an account.
     */
    public long countByAccount(Long accountId) {
        return repository.countByAccountId(accountId);
    }

    public long unreadCount(Long accountId) {
        return repository.countUnreadByAccountId(accountId);
    }

    /** Marks one of the account's own notifications read. False when it is not theirs or does not exist. */
    public boolean markRead(Long accountId, UUID notificationId) {
        if (repository.markRead(accountId, notificationId) == 1) {
            return true;
        }
        // Already read is still success for the owner; someone else's or missing is not.
        return repository.findById(notificationId).map(n -> n.getAccountId().equals(accountId)).orElse(false);
    }

    public int markAllRead(Long accountId) {
        return repository.markAllRead(accountId);
    }

    /**
     * Get a specific notification by ID.
     */
    public NotificationResponseDto getNotificationById(UUID notificationId) {
        Notification notification = repository.findById(notificationId)
                .orElseThrow(() -> new IllegalArgumentException("Notification not found"));
        return toDto(notification);
    }

    /**
     * The one way an order outcome or a price alert becomes a notification: the customer's own
     * settings decide whether they hear about it and on which channel, the row is stored once
     * per {@code eventId} (a replay is ignored), and then it is delivered. Empty when the
     * customer turned that type off, or the event was already recorded.
     * Never throws, so a notification problem can never undo the trade that caused it.
     *
     * @param message the text to show, or null for the standard sentence of the event type
     */
    public Optional<NotificationResponseDto> notify(long accountId, UUID eventId, NotificationEventType type,
                                                   String orderId, String symbol, String message) {
        try {
            ChannelRoute route = preferences.resolveChannel(accountId, AlertType.valueOf(type.name()));
            if (!route.deliver()) {
                log.debug("Account {} turned {} alerts off - no notification for event {}", accountId, type, eventId);
                return Optional.empty();
            }
            NotificationChannel channel = NotificationChannel.valueOf(route.channel().name());
            Notification stored = store(accountId, eventId, type, orderId, symbol, channel, message);
            dispatcher.deliver(stored);
            return Optional.of(toDto(stored));
        } catch (IllegalArgumentException duplicate) {
            if (duplicate.getMessage() != null && duplicate.getMessage().contains("already recorded")) {
                log.debug("Notification already recorded for event {}", eventId);
                return Optional.empty();
            }
            log.error("Could not notify account {} of {}", accountId, type, duplicate);
            return Optional.empty();
        } catch (RuntimeException e) {
            log.error("Could not notify account {} of {}", accountId, type, e);
            return Optional.empty();
        }
    }

    private Notification store(Long accountId, UUID eventId, NotificationEventType eventType,
                               String orderId, String symbol, NotificationChannel channel, String message) {
        if (repository.findByEventId(eventId).isPresent()) {
            throw new IllegalArgumentException("Notification already recorded for this event");
        }
        Notification notification = new Notification(accountId, eventId, eventType, orderId, symbol, channel,
                message != null ? message : generateMessage(eventType, orderId, symbol));
        try {
            repository.save(notification);
        } catch (DataIntegrityViolationException e) {
            // The unique index on event_id: a concurrent delivery of the same event won.
            throw new IllegalArgumentException("Notification already recorded for this event");
        }
        return notification;
    }

    private NotificationResponseDto toDto(Notification notification) {
        NotificationResponseDto dto = new NotificationResponseDto(
                notification.getNotificationId(),
                notification.getAccountId(),
                notification.getEventId(),
                notification.getEventType(),
                notification.getOrderId(),
                notification.getSymbol(),
                notification.getResolvedChannel(),
                notification.getMessage(),
                notification.getStatus(),
                notification.getCreatedAt(),
                notification.getUpdatedAt()
        );
        dto.setReadAt(notification.getReadAt());
        return dto;
    }

    /**
     * Generate human-readable message based on event type.
     */
    private String generateMessage(NotificationEventType eventType, String orderId, String symbol) {
        return switch (eventType) {
            case ORDER_FILLED -> String.format("Your order %s for %s has been filled.", orderId, symbol);
            case ORDER_REJECTED -> String.format("Your order %s for %s has been rejected.", orderId, symbol);
            case ORDER_CANCELLED -> String.format("Your order %s for %s has been cancelled.", orderId, symbol);
            case PRICE_ALERT -> String.format("Price alert for %s.", symbol);
        };
    }
}
