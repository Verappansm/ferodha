package com.trade.admin.mapper;

import java.math.BigDecimal;

// Commission taken on one instrument, in one account currency (the service
// adds the currencies up in USD).
public record FeeInstrumentRow(String symbol, String name, String currency, Long orders, BigDecimal fees) {
}
