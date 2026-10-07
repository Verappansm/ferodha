package com.trade.notification.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.trade.notification.enums.NotificationStatus;

public class UpdateNotificationStatusRequestDto {

    @JsonProperty("status")
    private NotificationStatus status;

    @JsonProperty("errorMessage")
    private String errorMessage;

    public UpdateNotificationStatusRequestDto() {
    }

    public UpdateNotificationStatusRequestDto(NotificationStatus status, String errorMessage) {
        this.status = status;
        this.errorMessage = errorMessage;
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
}
