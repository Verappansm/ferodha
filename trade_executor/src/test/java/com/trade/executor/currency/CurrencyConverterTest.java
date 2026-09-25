package com.trade.executor.currency;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class CurrencyConverterTest {

    private final CurrencyConverter converter = new CurrencyConverter();

    @Test
    void convertsUsdToInrAtTheFixedRate() {
        BigDecimal result = converter.convert(new BigDecimal("10"), "USD", "INR");
        assertEquals(0, new BigDecimal("900").compareTo(result));
    }

    @Test
    void convertsInrToUsdAtTheFixedRate() {
        BigDecimal result = converter.convert(new BigDecimal("900"), "INR", "USD");
        assertEquals(0, new BigDecimal("10").compareTo(result));
    }

    @Test
    void sameCurrencyPassesThroughUnchanged() {
        BigDecimal amount = new BigDecimal("42.50");
        assertEquals(0, amount.compareTo(converter.convert(amount, "USD", "USD")));
    }

    @Test
    void unsupportedPairThrows() {
        assertThrows(UnsupportedCurrencyPairException.class,
                () -> converter.convert(BigDecimal.TEN, "USD", "GBP"));
    }
}
