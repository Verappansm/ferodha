package com.trade.dto;

import java.util.List;

public record PaginatedInstrumentsResponseDto(
        List<InstrumentResponseDto> instruments,
        long total,
        int pageSize,
        long offset
) {
}
