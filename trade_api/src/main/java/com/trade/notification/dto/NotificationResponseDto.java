package com.trade.notification.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.trade.notification.enums.NotificationChannel;
import com.trade.notification.enums.NotificationEventType;
import com.trade.notification.enums.NotificationStatus;
import java.time.Instant;
import java.util.UUID;

public class NotificationResponseDto {

    @JsonProperty("notificationId")
    private UUID notificationId;

    @JsonProperty("accountId")
    private Long accountId;

    @JsonProperty("eventId")
    private UUID eventId;

    @JsonProperty("eventType")
    private NotificationEventType eventType;

    @JsonProperty("orderId")
    private String orderId;

    @JsonProperty("symbol")
    private String symbol;

    @JsonProperty("resolvedChannel")
    private NotificationChannel resolvedChannel;

    @JsonProperty("message")
    private String message;

    @JsonProperty("status")
    private NotificationStatus status;

    @JsonProperty("createdAt")
    private Instant createdAt;

    @JsonProperty("updatedAt")
    private Instant updatedAt;

    public NotificationResponseDto() {
    }

    public NotificationResponseDto(UUID notificationId, Long accountId, UUID eventId,
                                   NotificationEventType eventType, String orderId, String symbol,
                                   NotificationChannel resolvedChannel, String message,
                                   NotificationStatus status, Instant createdAt, Instant updatedAt) {
        this.notificationId = notificationId;
        this.accountId = accountId;
        this.eventId = eventId;
        this.eventType = eventType;
        this.orderId = orderId;
        this.symbol = symbol;
        this.resolvedChannel = resolvedChannel;
        this.message = message;
        this.status = status;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    // Getters and setters
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
