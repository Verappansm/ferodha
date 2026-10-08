package com.trade.mapper;

import java.math.BigDecimal;

/** The unfilled part of one open buy order: what it can still spend, in its instrument's currency. */
public record OpenBuyReservationRow(
        BigDecimal limitPrice,
        BigDecimal remainingQuantity,
        BigDecimal feeRate,
        String instrumentCurrency
) {
}
