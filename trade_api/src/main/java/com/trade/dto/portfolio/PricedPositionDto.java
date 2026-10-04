package com.trade.dto.portfolio;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

// contracts/portfolio-api.yaml PricedPosition. Amounts are in the
// instrument's own currency. lastPrice, marketValue, the unrealised figures
// and priceAsOf are null when the instrument could not be priced.
public record PricedPositionDto(
        Long accountId,
        String symbol,
        Integer quantity,
        BigDecimal averageCost,
        BigDecimal costBasis,
        BigDecimal lastPrice,
        BigDecimal marketValue,
        BigDecimal unrealisedPnl,
        BigDecimal unrealisedPnlPercent,
        String currency,
        OffsetDateTime priceAsOf,
        Boolean stale
) {
}
