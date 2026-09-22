package com.trade.generator.fauxnance.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record FauxnanceCandlesData(String symbol, String interval, String currency, List<FauxnanceCandle> candles) {
}
