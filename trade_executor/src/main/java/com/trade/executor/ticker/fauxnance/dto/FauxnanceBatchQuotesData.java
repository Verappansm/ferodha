package com.trade.executor.ticker.fauxnance.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record FauxnanceBatchQuotesData(List<FauxnanceBatchQuoteItem> quotes) {
}
