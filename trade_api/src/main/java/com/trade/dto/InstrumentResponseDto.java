package com.trade.dto;

import com.trade.enums.InstrumentType;

public record InstrumentResponseDto(
        String symbol,
        String name,
        InstrumentType type,
        String exchange,
        String currency,
        String sector
) {
}
