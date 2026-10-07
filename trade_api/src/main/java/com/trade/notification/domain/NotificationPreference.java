package com.trade.notification.domain;

import com.trade.notification.enums.NotificationChannel;
import java.time.Instant;

public class NotificationPreference {
    private Long accountId;
    private NotificationChannel notificationChannel;
    private Instant createdAt;
    private Instant updatedAt;

    public NotificationPreference() {
    }

    public NotificationPreference(Long accountId, NotificationChannel notificationChannel) {
        this.accountId = accountId;
        this.notificationChannel = notificationChannel;
        this.createdAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    public Long getAccountId() {
        return accountId;
    }

    public void setAccountId(Long accountId) {
        this.accountId = accountId;
    }

    public NotificationChannel getNotificationChannel() {
        return notificationChannel;
    }

    public void setNotificationChannel(NotificationChannel notificationChannel) {
        this.notificationChannel = notificationChannel;
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
