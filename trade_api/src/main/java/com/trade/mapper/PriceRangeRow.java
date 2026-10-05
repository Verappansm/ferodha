package com.trade.mapper;

import java.math.BigDecimal;

// The lowest low and highest high over a window; both null when empty.
public record PriceRangeRow(BigDecimal low, BigDecimal high) {
}
