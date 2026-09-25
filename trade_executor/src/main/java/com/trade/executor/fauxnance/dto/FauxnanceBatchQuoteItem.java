package com.trade.executor.fauxnance.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

// One entry in GET /quotes's "quotes" array - "quote" is present on success
// and absent (an "error" object instead, which we don't need) otherwise.
@JsonIgnoreProperties(ignoreUnknown = true)
public record FauxnanceBatchQuoteItem(String symbol, FauxnanceQuoteDetail quote) {
}
