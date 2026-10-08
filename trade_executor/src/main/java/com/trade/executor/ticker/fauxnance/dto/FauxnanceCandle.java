package com.trade.executor.ticker.fauxnance.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.math.BigDecimal;

// One daily OHLCV row from GET /candles/{symbol}, confirmed against the
// real Fauxnance OpenAPI spec. `close` is the raw traded price for the day;
// `adjclose` restates it in today's share terms for returns analysis - this
// service only ever needs the day's high/low, never adjclose.
@JsonIgnoreProperties(ignoreUnknown = true)
public record FauxnanceCandle(
        String date,
        BigDecimal open,
        BigDecimal high,
        BigDecimal low,
        BigDecimal close,
        BigDecimal adjclose,
        Long volume,
        boolean synthetic
) {
}
