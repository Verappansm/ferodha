package com.trade.executor.fauxnance.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

// GET /quotes/{symbol} wraps its payload as {"data": {"quote": {...}},
// "meta": {...}} - a single level of "data" wrapping, confirmed against
// analytics_etl/etl_pipeline/extract/extract.py's real use of the sibling
// /candles/{symbol} endpoint (payload["data"]["candles"]).
@JsonIgnoreProperties(ignoreUnknown = true)
public record FauxnanceQuoteEnvelope(FauxnanceQuoteData data) {
}
