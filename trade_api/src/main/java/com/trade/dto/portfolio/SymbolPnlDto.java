package com.trade.dto.portfolio;

import java.math.BigDecimal;

// contracts/portfolio-api.yaml SymbolPnl, in the account's base currency.
public record SymbolPnlDto(
        String symbol,
        BigDecimal realisedPnl,
        BigDecimal unrealisedPnl,
        BigDecimal totalPnl
) {
}
