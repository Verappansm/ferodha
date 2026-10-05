package com.trade.executor.util;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;

// Design question 1: what price is stored when the quote carries more
// decimal places than the column holds.
class MoneyRoundingTest {

    @Test
    void roundsHalfUpToTwoDecimalPlaces() {
        assertEquals(new BigDecimal("100.13"), MoneyRounding.toMoneyScale(new BigDecimal("100.125")));
        assertEquals(new BigDecimal("100.12"), MoneyRounding.toMoneyScale(new BigDecimal("100.124")));
    }

    @Test
    void padsFewerDecimalPlacesToScaleTwo() {
        assertEquals(new BigDecimal("100.00"), MoneyRounding.toMoneyScale(new BigDecimal("100")));
    }
}
