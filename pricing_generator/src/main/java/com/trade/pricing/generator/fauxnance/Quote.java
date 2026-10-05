package com.trade.pricing.generator.fauxnance;

import java.math.BigDecimal;

public record Quote(String symbol, BigDecimal bid, BigDecimal ask, String currency) {
}
