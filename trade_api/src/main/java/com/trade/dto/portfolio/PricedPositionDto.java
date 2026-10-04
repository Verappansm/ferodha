package com.trade.dto.portfolio;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Priced position: quantity, average cost, market value, unrealised P&L, staleness.
 * Contract: portfolio-api.yaml /portfolio/{accountId}/positions
 */
public record PricedPositionDto(
        Long accountId,
        String symbol,
        BigDecimal quantity,
        BigDecimal averageCost,
        BigDecimal costBasis,
        String currency,
        BigDecimal lastPrice,
        BigDecimal marketValue,
        BigDecimal unrealisedPnl,
        Boolean stale,
        Instant priceAsOf
) {
}
