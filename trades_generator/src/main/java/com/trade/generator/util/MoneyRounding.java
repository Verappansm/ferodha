package com.trade.generator.util;

import java.math.BigDecimal;
import java.math.RoundingMode;

// Answers design question 1: what price is stored when the quote carries
// more decimal places than the column holds. Every quote-derived price is
// rounded HALF_UP to 2 decimal places here, once, before it is used for
// affordability math or persisted - the same convention trade_api's
// Account.scaleToMoney already uses for cash balances.
public final class MoneyRounding {

    private MoneyRounding() {
    }

    public static BigDecimal toMoneyScale(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP);
    }
}
