package com.trade.service.currency;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.Map;

/** The API-owned USD/INR rate policy. Executors receive rates from this service. */
public final class CurrencyConversion {

    private static final BigDecimal USD_TO_INR = new BigDecimal("90");

    private CurrencyConversion() {
    }

    public static BigDecimal rate(String fromCurrency, String toCurrency) {
        if (fromCurrency.equals(toCurrency)) return BigDecimal.ONE;
        if ("USD".equals(fromCurrency) && "INR".equals(toCurrency)) return USD_TO_INR;
        if ("INR".equals(fromCurrency) && "USD".equals(toCurrency)) {
            return BigDecimal.ONE.divide(USD_TO_INR, MathContext.DECIMAL128);
        }
        throw new IllegalArgumentException("Unsupported currency pair: " + fromCurrency + " to " + toCurrency);
    }

    public static BigDecimal convert(BigDecimal amount, String fromCurrency, String toCurrency) {
        return amount.multiply(rate(fromCurrency, toCurrency));
    }

    public static Map<String, BigDecimal> ratesForInstrument(String instrumentCurrency) {
        return Map.of(
                "USD", rate(instrumentCurrency, "USD"),
                "INR", rate(instrumentCurrency, "INR"));
    }

    public static BigDecimal money(BigDecimal amount) {
        return amount.setScale(2, RoundingMode.HALF_UP);
    }
}
