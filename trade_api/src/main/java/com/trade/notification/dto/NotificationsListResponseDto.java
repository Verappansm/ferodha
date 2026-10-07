package com.trade.notification.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.trade.notification.dto.NotificationResponseDto;
import java.util.List;

public class NotificationsListResponseDto {

    @JsonProperty("notifications")
    private List<NotificationResponseDto> notifications;

    @JsonProperty("total")
    private long total;

    @JsonProperty("limit")
    private int limit;

    @JsonProperty("offset")
    private int offset;

    public NotificationsListResponseDto() {
    }

    public NotificationsListResponseDto(List<NotificationResponseDto> notifications, long total, int limit, int offset) {
        this.notifications = notifications;
        this.total = total;
        this.limit = limit;
        this.offset = offset;
    }

    public List<NotificationResponseDto> getNotifications() {
        return notifications;
    }

    public void setNotifications(List<NotificationResponseDto> notifications) {
        this.notifications = notifications;
    }

    public long getTotal() {
        return total;
    }

    public void setTotal(long total) {
        this.total = total;
    }

    public int getLimit() {
        return limit;
    }

    public void setLimit(int limit) {
        this.limit = limit;
    }

    public int getOffset() {
        return offset;
    }

    public void setOffset(int offset) {
        this.offset = offset;
    }
}
