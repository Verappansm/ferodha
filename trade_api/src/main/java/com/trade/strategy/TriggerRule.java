package com.trade.strategy;

import java.math.BigDecimal;
import java.math.RoundingMode;

// When a strategy fires, and at what limit price. Pure functions, no state.
//
// Like a limit order, a strategy acts at once when its condition is already
// true as it starts watching (the first price it sees, right after it is
// enabled): a BUY whose level is at or above the ask, or a SELL whose level is
// at or below the bid, fires on that first tick. From then on a trigger is a
// crossing, not a level: it fires on the tick that moves from one side of the
// level to the other, so a price that stays beyond the level does not fire on
// every tick and a strategy allowed several orders cannot spend them all at
// once.
//
// A BUY watches the ask (what a buyer pays) and fires when it falls to or
// through the level; a SELL watches the bid and fires when it rises to or
// through it. The limit is the quote nudged 0.02% towards the other side, the
// same buffer the order ticket suggests, so the order is marketable.
public final class TriggerRule {

    static final BigDecimal BUY_BUFFER = new BigDecimal("1.0002");
    static final BigDecimal SELL_BUFFER = new BigDecimal("0.9998");

    private TriggerRule() {
    }

    // The decision the engine takes on each tick.
    public static boolean shouldFire(String side, BigDecimal level, BigDecimal previous, BigDecimal current) {
        if (current == null) {
            return false;
        }
        return previous == null ? met(side, level, current) : crossed(side, level, previous, current);
    }

    // The level has been reached: a BUY when the ask is at or below it, a SELL
    // when the bid is at or above it.
    public static boolean met(String side, BigDecimal level, BigDecimal current) {
        return "BUY".equals(side) ? current.compareTo(level) <= 0 : current.compareTo(level) >= 0;
    }

    public static boolean crossed(String side, BigDecimal level, BigDecimal previous, BigDecimal current) {
        if (previous == null || current == null) {
            return false;
        }
        if ("BUY".equals(side)) {
            return previous.compareTo(level) > 0 && current.compareTo(level) <= 0;
        }
        return previous.compareTo(level) < 0 && current.compareTo(level) >= 0;
    }

    public static BigDecimal limitPrice(String side, BigDecimal quote) {
        return "BUY".equals(side)
                ? quote.multiply(BUY_BUFFER).setScale(2, RoundingMode.CEILING)
                : quote.multiply(SELL_BUFFER).setScale(2, RoundingMode.FLOOR);
    }
}
