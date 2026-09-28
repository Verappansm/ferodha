package com.trade.pricing.generator.fauxnance.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record FauxnanceBatchQuotesData(List<FauxnanceBatchQuoteItem> quotes) {
}
