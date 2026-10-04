package com.trade.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * Response DTO for candle data endpoint.
 * Contains all candles for a symbol/interval combination.
 */
public record CandlesResponseDto(
        @JsonProperty("symbol")
        String symbol,

        @JsonProperty("interval")
        String interval,

        @JsonProperty("candles")
        List<CandleDto> candles
) {
}
