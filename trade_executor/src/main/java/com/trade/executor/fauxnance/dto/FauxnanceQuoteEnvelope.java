package com.trade.executor.fauxnance.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

// GET /quotes/{symbol} wraps its payload as {"data": {...quote fields...},
// "meta": {...}} - the Quote object sits directly under "data", not nested
// under a further "quote" key (confirmed against the real Fauxnance OpenAPI
// spec). That nesting only happens on the batch GET /quotes endpoint - see
// FauxnanceBatchQuoteItem - the two shapes genuinely differ.
@JsonIgnoreProperties(ignoreUnknown = true)
public record FauxnanceQuoteEnvelope(FauxnanceQuoteData data) {
}
