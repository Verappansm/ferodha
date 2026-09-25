package com.trade.executor.fee;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;

class FeeCalculatorTest {

    @Test
    void calculatesFlatPercentageOfTradeValue() {
        FeeCalculator calculator = new FeeCalculator(new BigDecimal("0.001"));

        BigDecimal fee = calculator.calculateFee(new BigDecimal("1000.00"));

        assertEquals(0, new BigDecimal("1.000").compareTo(fee));
    }
}
