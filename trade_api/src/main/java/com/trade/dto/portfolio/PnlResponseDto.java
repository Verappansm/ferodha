package com.trade.dto.portfolio;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

// contracts/portfolio-api.yaml PnlResponse. from and to are always present
// (null when unbounded); bySymbol only when the caller asked for it.
public record PnlResponseDto(
        Long accountId,
        String baseCurrency,
        LocalDate from,
        LocalDate to,
        BigDecimal realisedPnl,
        BigDecimal unrealisedPnl,
        BigDecimal totalPnl,
        @JsonInclude(JsonInclude.Include.NON_NULL) List<SymbolPnlDto> bySymbol,
        OffsetDateTime asOf
) {
}
