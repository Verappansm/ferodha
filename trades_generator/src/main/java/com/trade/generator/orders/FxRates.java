package com.trade.generator.orders;

import java.math.BigDecimal;
import java.math.MathContext;
import java.util.Map;
import java.util.Optional;

// The rates trade_api puts on ORDER_PLACED (its CurrencyConversion: a fixed
// 90 INR = 1 USD), copied here because this service builds its own ORDER_PLACED
// messages and the executor dead-letters any message that carries no rate for
// the account's currency. A copy, not a dependency, like every cross-service
// shape in this repo; the executor settles with whatever rates the message
// carries, so the two must stay the same (USD <-> INR only).
final class FxRates {

    private static final BigDecimal USD_TO_INR = new BigDecimal("90");

    private FxRates() {
    }

    // "instrument currency -> account currency" for every currency an account
    // can hold, or empty when the instrument is priced in a currency there is
    // no rate for (the generator then leaves that symbol alone).
    static Optional<Map<String, BigDecimal>> forInstrument(String instrumentCurrency) {
        if ("USD".equals(instrumentCurrency)) {
            return Optional.of(Map.of("USD", BigDecimal.ONE, "INR", USD_TO_INR));
        }
        if ("INR".equals(instrumentCurrency)) {
            return Optional.of(Map.of("INR", BigDecimal.ONE,
                    "USD", BigDecimal.ONE.divide(USD_TO_INR, MathContext.DECIMAL128)));
        }
        return Optional.empty();
    }
}
