package com.trade.pricing.generator.pricing;

import com.trade.pricing.generator.fauxnance.Quote;
import com.trade.pricing.generator.util.MoneyRounding;

import java.math.BigDecimal;
import java.math.RoundingMode;

// The synthetic tick, and the whole reason it's a pure function of its
// inputs rather than a method that reaches for the clock or a random source
// itself: it has to be testable the same deliberate way FillRule is, with
// no I/O and no hidden state. Callers own the randomness (pass in one
// Gaussian draw) and the memory (pass in the last mid this symbol produced).
//
// Mean-reverting random walk, not a pure random walk: each tick moves most
// of the way back toward the last real Fauxnance quote's mid-price before
// adding noise, so five minutes of ticks wander around the real anchor
// instead of drifting away from it. Two hard clamps apply after that,
// always, regardless of how large the noise term came out:
//   1. the result never leaves [today's candle low, today's candle high]
//   2. the spread (ask - bid) is never narrower than the real quote's own
//      spread - a synthetic market that's tighter than the real one is the
//      one thing that would look implausible next to it
public final class RandomizerModel {

    // Fraction of the gap to the anchor closed on every tick, before noise
    // is added. Closer to 1 = snaps back to the anchor almost immediately;
    // closer to 0 = wanders freely and barely reverts.
    private static final BigDecimal REVERSION = BigDecimal.valueOf(0.7);

    private RandomizerModel() {
    }

    public record Bounds(BigDecimal low, BigDecimal high) {
        public Bounds {
            if (low.compareTo(high) > 0) {
                throw new IllegalArgumentException("low " + low + " is above high " + high);
            }
        }
    }

    public static Quote next(Quote anchor, BigDecimal lastMid, Bounds bounds, double volatility, double gaussianNoise) {
        BigDecimal anchorMid = mid(anchor.bid(), anchor.ask());
        BigDecimal anchorSpread = anchor.ask().subtract(anchor.bid());

        BigDecimal reverted = lastMid.add(anchorMid.subtract(lastMid).multiply(REVERSION));
        BigDecimal noise = anchorMid.multiply(BigDecimal.valueOf(volatility * gaussianNoise));
        BigDecimal nextMid = clamp(reverted.add(noise), bounds);

        BigDecimal halfSpread = anchorSpread.divide(BigDecimal.valueOf(2), 6, RoundingMode.HALF_UP);
        BigDecimal bid = MoneyRounding.toMoneyScale(nextMid.subtract(halfSpread));
        BigDecimal ask = MoneyRounding.toMoneyScale(nextMid.add(halfSpread));
        return new Quote(anchor.symbol(), bid, ask, anchor.currency());
    }

    private static BigDecimal mid(BigDecimal bid, BigDecimal ask) {
        return bid.add(ask).divide(BigDecimal.valueOf(2), 6, RoundingMode.HALF_UP);
    }

    private static BigDecimal clamp(BigDecimal value, Bounds bounds) {
        if (value.compareTo(bounds.low()) < 0) {
            return bounds.low();
        }
        if (value.compareTo(bounds.high()) > 0) {
            return bounds.high();
        }
        return value;
    }
}
