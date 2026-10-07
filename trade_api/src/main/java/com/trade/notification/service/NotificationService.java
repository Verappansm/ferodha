package com.trade.notification.service;

import com.trade.notification.domain.Notification;
import com.trade.notification.domain.NotificationRepository;
import com.trade.notification.dto.NotificationResponseDto;
import com.trade.notification.enums.NotificationChannel;
import com.trade.notification.enums.NotificationEventType;
import com.trade.notification.enums.NotificationStatus;
import com.trade.notification.exception.PreferencesNotFoundException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class NotificationService {

    private final NotificationRepository repository;
    private final NotificationPreferenceService preferenceService;

    public NotificationService(NotificationRepository repository, NotificationPreferenceService preferenceService) {
        this.repository = repository;
        this.preferenceService = preferenceService;
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

    /**
     * Get a specific notification by ID.
     */
    public NotificationResponseDto getNotificationById(UUID notificationId) {
        Notification notification = repository.findById(notificationId)
                .orElseThrow(() -> new IllegalArgumentException("Notification not found"));
        return toDto(notification);
    }

    /**
     * Record a notification from a trade event (Kafka consumer entry point).
     * Idempotent on eventId: returns 409 if already recorded.
     */
    @Transactional(rollbackFor = Exception.class)
    public NotificationResponseDto recordNotification(Long accountId, UUID eventId,
                                                      NotificationEventType eventType,
                                                      String orderId, String symbol)
            throws PreferencesNotFoundException {

        // Check if already recorded (idempotency)
        if (repository.findByEventId(eventId).isPresent()) {
            throw new IllegalArgumentException("Notification already recorded for this event");
        }

        // Resolve channel from preferences
        NotificationChannel channel = preferenceService.getPreference(accountId).getNotificationChannel();

        // Generate message based on event type
        String message = generateMessage(eventType, orderId, symbol);

        // Create and save notification
        Notification notification = new Notification(accountId, eventId, eventType, orderId, symbol, channel, message);

        try {
            repository.save(notification);
        } catch (DataIntegrityViolationException e) {
            // Handle unique constraint on eventId
            throw new IllegalArgumentException("Notification already recorded for this event");
        }

        return toDto(notification);
    }

    /**
     * Update notification status (sent, failed, retrying).
     */
    @Transactional
    public NotificationResponseDto updateNotificationStatus(UUID notificationId, NotificationStatus status, String errorMessage) {
        Notification notification = repository.findById(notificationId)
                .orElseThrow(() -> new IllegalArgumentException("Notification not found"));

        notification.setStatus(status);
        notification.setErrorMessage(errorMessage);
        notification.setUpdatedAt(Instant.now());
        repository.update(notification);

        return toDto(notification);
    }

    /**
     * Send a watchlist alert notification.
     */
    @Transactional
    public NotificationResponseDto sendWatchlistAlert(Long accountId, String symbol, String message) throws PreferencesNotFoundException {
        // Resolve channel from preferences
        NotificationChannel channel = preferenceService.getPreference(accountId).getNotificationChannel();

        // Create notification with a unique event ID (watchlist events aren't from Kafka)
        Notification notification = new Notification(accountId, UUID.randomUUID(),
                NotificationEventType.ORDER_FILLED, // Use a generic event type
                null, symbol, channel, message);

        repository.save(notification);
        return toDto(notification);
    }

    /**
     * Convert domain model to DTO.
     */
    private NotificationResponseDto toDto(Notification notification) {
        return new NotificationResponseDto(
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
    }

    /**
     * Generate human-readable message based on event type.
     */
    private String generateMessage(NotificationEventType eventType, String orderId, String symbol) {
        return switch (eventType) {
            case ORDER_FILLED -> String.format("Your order %s for %s has been filled.", orderId, symbol);
            case ORDER_REJECTED -> String.format("Your order %s for %s has been rejected.", orderId, symbol);
            case ORDER_CANCELLED -> String.format("Your order %s for %s has been cancelled.", orderId, symbol);
            default -> "Your order has been updated.";
        };
    }
}
