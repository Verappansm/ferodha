package com.trade.executor.event;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.math.BigDecimal;
import java.time.Instant;

@JsonIgnoreProperties(ignoreUnknown = true)
public record MarketDataQuotePayload(String symbol, BigDecimal bid, BigDecimal ask, String currency, Instant asOf) {
}
