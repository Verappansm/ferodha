package com.trade.notification.domain;

import com.trade.notification.enums.NotificationChannel;
import com.trade.notification.enums.NotificationEventType;
import com.trade.notification.enums.NotificationStatus;
import java.time.Instant;
import java.util.UUID;

public class Notification {
    private UUID notificationId;
    private Long accountId;
    private UUID eventId;
    private NotificationEventType eventType;
    private String orderId;
    private String symbol;
    private NotificationChannel resolvedChannel;
    private String message;
    private NotificationStatus status;
    private String errorMessage;
    private Instant createdAt;
    private Instant updatedAt;
    private Instant readAt;

    public Notification() {
    }

    public Notification(Long accountId, UUID eventId, NotificationEventType eventType,
                        String orderId, String symbol, NotificationChannel resolvedChannel,
                        String message) {
        this.notificationId = UUID.randomUUID();
        this.accountId = accountId;
        this.eventId = eventId;
        this.eventType = eventType;
        this.orderId = orderId;
        this.symbol = symbol;
        this.resolvedChannel = resolvedChannel;
        this.message = message;
        this.status = NotificationStatus.QUEUED;
        this.createdAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    public Instant getReadAt() {
        return readAt;
    }

    public void setReadAt(Instant readAt) {
        this.readAt = readAt;
    }

    public UUID getNotificationId() {
        return notificationId;
    }

    public void setNotificationId(UUID notificationId) {
        this.notificationId = notificationId;
    }

    public Long getAccountId() {
        return accountId;
    }

    public void setAccountId(Long accountId) {
        this.accountId = accountId;
    }

    public UUID getEventId() {
        return eventId;
    }

    public void setEventId(UUID eventId) {
        this.eventId = eventId;
    }

    public NotificationEventType getEventType() {
        return eventType;
    }

    public void setEventType(NotificationEventType eventType) {
        this.eventType = eventType;
    }

    public String getOrderId() {
        return orderId;
    }

    public void setOrderId(String orderId) {
        this.orderId = orderId;
    }

    public String getSymbol() {
        return symbol;
    }

    public void setSymbol(String symbol) {
        this.symbol = symbol;
    }

    public NotificationChannel getResolvedChannel() {
        return resolvedChannel;
    }

    public void setResolvedChannel(NotificationChannel resolvedChannel) {
        this.resolvedChannel = resolvedChannel;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public NotificationStatus getStatus() {
        return status;
    }

    public void setStatus(NotificationStatus status) {
        this.status = status;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
