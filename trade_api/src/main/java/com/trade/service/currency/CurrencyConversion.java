package com.trade.service.currency;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.Map;
import java.util.Optional;

/** The API-owned USD/INR rate policy. Executors receive rates from this service. */
public final class CurrencyConversion {

    private static final BigDecimal USD_TO_INR = new BigDecimal("90");

    private CurrencyConversion() {
    }

    // Accounts can be opened in currencies this policy has no rate for (the
    // admin console offers EUR and GBP), so callers check before converting:
    // a write rejects the order, a read leaves the converted figure out.
    public static boolean isSupported(String fromCurrency, String toCurrency) {
        if (fromCurrency == null || toCurrency == null) return false;
        if (fromCurrency.equals(toCurrency)) return true;
        return ("USD".equals(fromCurrency) && "INR".equals(toCurrency))
                || ("INR".equals(fromCurrency) && "USD".equals(toCurrency));
    }

    public static BigDecimal rate(String fromCurrency, String toCurrency) {
        if (!isSupported(fromCurrency, toCurrency)) {
            throw new IllegalArgumentException("Unsupported currency pair: " + fromCurrency + " to " + toCurrency);
        }
        if (fromCurrency.equals(toCurrency)) return BigDecimal.ONE;
        if ("USD".equals(fromCurrency)) return USD_TO_INR;
        return BigDecimal.ONE.divide(USD_TO_INR, MathContext.DECIMAL128);
    }

    public static BigDecimal convert(BigDecimal amount, String fromCurrency, String toCurrency) {
        return amount.multiply(rate(fromCurrency, toCurrency));
    }

    public static Optional<BigDecimal> tryConvert(BigDecimal amount, String fromCurrency, String toCurrency) {
        if (amount == null || !isSupported(fromCurrency, toCurrency)) {
            return Optional.empty();
        }
        return Optional.of(convert(amount, fromCurrency, toCurrency));
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
