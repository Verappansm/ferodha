package com.trade.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Single candle OHLC data point for chart display.
 */
public record CandleDto(
        @JsonProperty("date")
        LocalDate date,

        @JsonProperty("open")
        BigDecimal open,

        @JsonProperty("high")
        BigDecimal high,

        @JsonProperty("low")
        BigDecimal low,

        @JsonProperty("close")
        BigDecimal close,

        @JsonProperty("volume")
        Long volume
) {
}
