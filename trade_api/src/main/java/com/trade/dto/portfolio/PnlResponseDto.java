package com.trade.dto.portfolio;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Profit and loss summary: realised and unrealised totals.
 * Contract: portfolio-api.yaml /portfolio/{accountId}/pnl
 */
public record PnlResponseDto(
        Long accountId,
        String baseCurrency,
        BigDecimal realisedPnl,
        BigDecimal unrealisedPnl,
        BigDecimal totalPnl,
        Instant asOf
) {
}
