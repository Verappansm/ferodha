package com.trade.executor.ticker.fauxnance.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.math.BigDecimal;

@JsonIgnoreProperties(ignoreUnknown = true)
public record FauxnanceQuoteDetail(String symbol, BigDecimal price, BigDecimal bid, BigDecimal ask,
                                    String currency) {
}
