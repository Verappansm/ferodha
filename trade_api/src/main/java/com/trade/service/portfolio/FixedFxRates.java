package com.trade.service.portfolio;

import java.math.BigDecimal;
import java.util.Optional;
import com.trade.service.currency.CurrencyConversion;

// The portfolio totals are in the account's currency, and an INR account can
// hold USD instruments. This delegates to trade_api's single fixed FX policy,
// which also supplies order review, affordability checks and executor rates.
// Any other pair is unsupported: the holding is left out of the totals and
// the summary is marked partial rather than summed unconverted.
public final class FixedFxRates {

    private FixedFxRates() {
    }

    // INR per USD, for SQL that has to order amounts across the two currencies.
    public static BigDecimal inrPerUsd() {
        return CurrencyConversion.rate("USD", "INR");
    }

    public static Optional<BigDecimal> convert(BigDecimal amount, String fromCurrency, String toCurrency) {
        if (amount == null) {
            return Optional.empty();
        }
        try {
            return Optional.of(CurrencyConversion.convert(amount, fromCurrency, toCurrency)
                    .setScale(PortfolioService.WORKING_SCALE, PortfolioService.ROUNDING));
        } catch (IllegalArgumentException unsupportedPair) {
            return Optional.empty();
        }
    }
}
