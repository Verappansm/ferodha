package com.trade.executor.pricing;

import com.trade.executor.enums.OrderSide;

import java.math.BigDecimal;

// The only two facts FillRule needs about an order. Deliberately not the
// mapper's OrderRow (or any DB/Spring type) - keeps the fill rule itself
// touching no database and no socket, exactly as the story requires.
public record OrderForPricing(OrderSide side, BigDecimal limitPrice) {
}
