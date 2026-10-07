package com.trade.notification.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.trade.notification.enums.NotificationChannel;

public class UpdateNotificationPreferencesRequestDto {

    @JsonProperty("notificationChannel")
    private NotificationChannel notificationChannel;

    public UpdateNotificationPreferencesRequestDto() {
    }

    public UpdateNotificationPreferencesRequestDto(NotificationChannel notificationChannel) {
        this.notificationChannel = notificationChannel;
    }

    public NotificationChannel getNotificationChannel() {
        return notificationChannel;
    }

    public void setNotificationChannel(NotificationChannel notificationChannel) {
        this.notificationChannel = notificationChannel;
    }
}
