package com.trade.notification.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.trade.notification.enums.NotificationChannel;
import java.time.Instant;

public class NotificationPreferencesResponseDto {

    @JsonProperty("notificationChannel")
    private NotificationChannel notificationChannel;

    @JsonProperty("updatedAt")
    private Instant updatedAt;

    public NotificationPreferencesResponseDto() {
    }

    public NotificationPreferencesResponseDto(NotificationChannel notificationChannel, Instant updatedAt) {
        this.notificationChannel = notificationChannel;
        this.updatedAt = updatedAt;
    }

    public NotificationChannel getNotificationChannel() {
        return notificationChannel;
    }

    public void setNotificationChannel(NotificationChannel notificationChannel) {
        this.notificationChannel = notificationChannel;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
