package com.trade.strategy;

import java.math.BigDecimal;
import java.util.Optional;

// The point-of-decision limits, checked just before every order a strategy
// would place. A refusal here is a business outcome (the customer's own cap
// held), not a malfunction, so it never counts towards the failure breaker.
//
//   BUY  - everything the strategy has committed so far plus this order, fee
//          included, must fit max spend; and units already held plus units in
//          pending buys plus this order must fit max position.
//   SELL - the units not already promised to pending sells must cover it.
public final class RiskLimits {

    private RiskLimits() {
    }

    // committedSpend: fee-inclusive value of the strategy's live and filled buys.
    // units: BUY - held plus pending buys; SELL - held minus pending sells.
    public static Optional<String> check(Strategy strategy, BigDecimal committedSpend, long units,
                                         BigDecimal limitPrice, BigDecimal feeRate) {
        int quantity = strategy.quantity();
        if (!strategy.isBuy()) {
            return units >= quantity
                    ? Optional.empty()
                    : Optional.of("Not enough units: " + units + " available, " + quantity + " to sell");
        }
        BigDecimal value = limitPrice.multiply(BigDecimal.valueOf(quantity));
        BigDecimal cost = value.add(value.multiply(feeRate));
        if (strategy.maxSpend() != null && committedSpend.add(cost).compareTo(strategy.maxSpend()) > 0) {
            return Optional.of("Max spend " + strategy.maxSpend().toPlainString() + " would be exceeded");
        }
        if (strategy.maxPosition() != null && units + quantity > strategy.maxPosition()) {
            return Optional.of("Max position " + strategy.maxPosition() + " would be exceeded");
        }
        return Optional.empty();
    }
}
