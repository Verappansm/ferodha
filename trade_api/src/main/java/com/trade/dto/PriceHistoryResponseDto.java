package com.trade.dto;

import java.util.List;

// GET /api/v1/instruments/{symbol}/history: oldest point first.
public record PriceHistoryResponseDto(
        String symbol,
        String range,
        String interval,
        List<PricePointDto> points
) {
}
