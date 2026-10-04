package com.trade.dto.portfolio;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// contracts/portfolio-api.yaml PortfolioSummary. Every amount is in
// baseCurrency, the account's own currency.
public record PortfolioSummaryDto(
        Long accountId,
        String baseCurrency,
        BigDecimal cashBalance,
        BigDecimal marketValue,
        BigDecimal costBasis,
        BigDecimal unrealisedPnl,
        BigDecimal unrealisedPnlPercent,
        BigDecimal realisedPnl,
        BigDecimal totalValue,
        Integer positionCount,
        Boolean partial,
        OffsetDateTime asOf
) {
}
