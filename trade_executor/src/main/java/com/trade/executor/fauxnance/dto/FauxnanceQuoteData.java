package com.trade.executor.fauxnance.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record FauxnanceQuoteData(FauxnanceQuoteDetail quote) {
}
