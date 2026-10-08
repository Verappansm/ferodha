package com.trade.dto;

import java.util.List;

/** The distinct exchanges, sectors and types of the tradable instruments (LEAP-015). */
public record InstrumentFiltersResponseDto(
        List<String> exchanges,
        List<String> sectors,
        List<String> types
) {
}
