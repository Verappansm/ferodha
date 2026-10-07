package com.trade.service.portfolio;

import java.math.BigDecimal;
import java.util.Optional;

// The portfolio totals are in the account's currency, and an INR account can
// hold USD instruments. Until LEAP-006 brings live rates, this uses the same
// fixed table trade_executor settles at (CurrencyConverter: 90 INR = 1 USD),
// so the portfolio values a holding at the rate the trade was charged at.
// Any other pair is unsupported: the holding is left out of the totals and
// the summary is marked partial rather than summed unconverted.
public final class FixedFxRates {

    private static final String USD = "USD";
    private static final String INR = "INR";
    private static final BigDecimal USD_TO_INR = new BigDecimal("90");

    private FixedFxRates() {
    }

    // INR per USD, for SQL that has to order amounts across the two currencies.
    public static BigDecimal inrPerUsd() {
        return USD_TO_INR;
    }

    public static Optional<BigDecimal> convert(BigDecimal amount, String fromCurrency, String toCurrency) {
        if (amount == null) {
            return Optional.empty();
        }
        if (fromCurrency.equals(toCurrency)) {
            return Optional.of(amount);
        }
        if (USD.equals(fromCurrency) && INR.equals(toCurrency)) {
            return Optional.of(amount.multiply(USD_TO_INR));
        }
        if (INR.equals(fromCurrency) && USD.equals(toCurrency)) {
            return Optional.of(amount.divide(USD_TO_INR, PortfolioService.WORKING_SCALE, PortfolioService.ROUNDING));
        }
        return Optional.empty();
    }
}
