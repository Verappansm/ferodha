package com.trade.generator.fauxnance.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

// GET /quotes?symbols=A,B,C wraps its payload the same way the
// single-symbol endpoint does: {"data": {"quotes": [...]}, "meta": {...}}.
@JsonIgnoreProperties(ignoreUnknown = true)
public record FauxnanceBatchQuotesEnvelope(FauxnanceBatchQuotesData data) {
}
