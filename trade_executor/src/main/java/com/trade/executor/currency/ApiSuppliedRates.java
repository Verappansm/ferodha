package com.trade.executor.currency;

import java.math.BigDecimal;
import java.util.Map;

/** Applies conversion multipliers calculated by trade_api to actual fill values. */
public final class ApiSuppliedRates {

    private ApiSuppliedRates() {
    }

    public static BigDecimal apply(BigDecimal instrumentAmount, String accountCurrency,
                                   Map<String, BigDecimal> instrumentToAccountRates) {
        if (instrumentToAccountRates == null || !instrumentToAccountRates.containsKey(accountCurrency)) {
            throw new IllegalStateException("ORDER_PLACED is missing the API FX rate for " + accountCurrency);
        }
        return instrumentAmount.multiply(instrumentToAccountRates.get(accountCurrency));
    }
}
