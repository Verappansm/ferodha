package com.trade.notification.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class SendWatchlistAlertRequestDto {

    @JsonProperty("symbol")
    private String symbol;

    @JsonProperty("message")
    private String message;

    public SendWatchlistAlertRequestDto() {
    }

    public SendWatchlistAlertRequestDto(String symbol, String message) {
        this.symbol = symbol;
        this.message = message;
    }

    public String getSymbol() {
        return symbol;
    }

    public void setSymbol(String symbol) {
        this.symbol = symbol;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }
}
