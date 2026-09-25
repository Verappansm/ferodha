package com.trade.generator.fauxnance.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

// GET /candles/{symbol} wraps its payload as {"data": {..., "candles": [...]}, "meta": {...}}
// - confirmed against the real Fauxnance OpenAPI spec.
@JsonIgnoreProperties(ignoreUnknown = true)
public record FauxnanceCandlesEnvelope(FauxnanceCandlesData data) {
}
