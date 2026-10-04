package com.trade.dto.portfolio;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Portfolio summary: cash balance, total market value, cost basis, and P&L totals.
 * Contract: portfolio-api.yaml /portfolio/{accountId}
 */
public record PortfolioSummaryDto(
        Long accountId,
        String baseCurrency,
        BigDecimal cashBalance,
        BigDecimal marketValue,
        BigDecimal costBasis,
        BigDecimal unrealisedPnl,
        BigDecimal realisedPnl,
        BigDecimal totalValue,
        Integer positionCount,
        Boolean partial,      // true if some symbols have no quote
        Instant priceAsOf,
        Instant asOf
) {
}
