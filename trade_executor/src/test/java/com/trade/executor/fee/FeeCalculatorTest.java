package com.trade.executor.fee;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;

class FeeCalculatorTest {

    private final FeeCalculator calculator = new FeeCalculator();

    @Test
    void calculatesFlatPercentageOfTradeValue() {
        BigDecimal fee = calculator.calculateFee(new BigDecimal("1000.00"), new BigDecimal("0.001"));

        assertEquals(0, new BigDecimal("1.000").compareTo(fee));
    }

    @Test
    void chargesAtTheRateItIsGiven() {
        BigDecimal fee = calculator.calculateFee(new BigDecimal("1000.00"), new BigDecimal("0.0025"));

        assertEquals(0, new BigDecimal("2.50").compareTo(fee));
    }

    @Test
    void aZeroRateOrderPaysNoFee() {
        BigDecimal fee = calculator.calculateFee(new BigDecimal("1000.00"), BigDecimal.ZERO);

        assertEquals(0, BigDecimal.ZERO.compareTo(fee));
    }
}
