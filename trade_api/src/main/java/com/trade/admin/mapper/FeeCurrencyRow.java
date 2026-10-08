package com.trade.admin.mapper;

import java.math.BigDecimal;

// Commission taken on filled orders in one account currency.
public record FeeCurrencyRow(String currency, Long orders, BigDecimal fees) {
}
