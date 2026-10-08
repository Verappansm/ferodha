package com.trade.executor.ticker.fauxnance.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;

// GET /quotes/{symbol} returns {"data": {"symbol": "...", "bid": ..., "ask": ...}, "meta": {...}}
// The quote details are directly in data, not nested under a "quote" field.
@JsonIgnoreProperties(ignoreUnknown = true)
public record FauxnanceQuoteData(
    String symbol,
    BigDecimal price,
    BigDecimal bid,
    BigDecimal ask,
    String currency
) {

    // Adapter method to convert this to a FauxnanceQuoteDetail
    public FauxnanceQuoteDetail quote() {
        return new FauxnanceQuoteDetail(symbol, price, bid, ask, currency);
    }
}
