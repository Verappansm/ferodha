package com.trade.notification.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.trade.notification.enums.NotificationEventType;
import java.util.UUID;

public class RecordNotificationRequestDto {

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

    public RecordNotificationRequestDto() {
    }

    public RecordNotificationRequestDto(Long accountId, UUID eventId, NotificationEventType eventType,
                                        String orderId, String symbol) {
        this.accountId = accountId;
        this.eventId = eventId;
        this.eventType = eventType;
        this.orderId = orderId;
        this.symbol = symbol;
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
}
