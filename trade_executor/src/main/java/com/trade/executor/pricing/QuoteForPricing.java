package com.trade.executor.pricing;

import java.math.BigDecimal;

// The only two facts FillRule needs about a quote - not the Fauxnance DTO,
// which carries fields (currency, asOf, spreadBps...) the fill rule itself
// has no business looking at.
public record QuoteForPricing(BigDecimal bid, BigDecimal ask) {
}
