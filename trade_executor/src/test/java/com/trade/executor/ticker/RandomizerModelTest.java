package com.trade.executor.ticker;

import com.trade.executor.ticker.fauxnance.Quote;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

// No I/O, no Spring context - the caller owns the random draw and the
// memory of the last mid, so every case here is a plain assertion against
// a pure function, the same deliberate style as FillRuleTest.
class RandomizerModelTest {

    private static final Quote ANCHOR = new Quote("AAPL", new BigDecimal("99.00"), new BigDecimal("100.50"), "USD");
    private static final RandomizerModel.Bounds WIDE_BOUNDS =
            new RandomizerModel.Bounds(new BigDecimal("50.00"), new BigDecimal("150.00"));

    @Test
    void withZeroNoiseTheResultRevertsTowardTheAnchorMid() {
        BigDecimal lastMid = new BigDecimal("120.00"); // far from the anchor's 99.75 mid
        Quote tick = RandomizerModel.next(ANCHOR, lastMid, WIDE_BOUNDS, 0.01, 0.0);

        BigDecimal tickMid = tick.bid().add(tick.ask()).divide(BigDecimal.valueOf(2));
        // Moved closer to 99.75 than the 120.00 it started at, with zero noise.
        assertTrue(tickMid.subtract(new BigDecimal("99.75")).abs()
                .compareTo(lastMid.subtract(new BigDecimal("99.75")).abs()) < 0);
    }

    @Test
    void neverProducesAMidOutsideTheCandleBounds() {
        RandomizerModel.Bounds tightBounds =
                new RandomizerModel.Bounds(new BigDecimal("99.00"), new BigDecimal("100.00"));

        // A huge noise draw would push the mid far outside [99, 100] without the clamp.
        Quote tick = RandomizerModel.next(ANCHOR, new BigDecimal("99.75"), tightBounds, 0.5, 100.0);

        BigDecimal tickMid = tick.bid().add(tick.ask()).divide(BigDecimal.valueOf(2));
        assertTrue(tickMid.compareTo(tightBounds.low()) >= 0, "mid " + tickMid + " below low bound");
        assertTrue(tickMid.compareTo(tightBounds.high()) <= 0, "mid " + tickMid + " above high bound");
    }

    @Test
    void spreadIsNeverNarrowerThanTheAnchorsOwnSpread() {
        Quote tick = RandomizerModel.next(ANCHOR, new BigDecimal("99.75"), WIDE_BOUNDS, 0.001, 0.0);

        BigDecimal anchorSpread = ANCHOR.ask().subtract(ANCHOR.bid());
        BigDecimal tickSpread = tick.ask().subtract(tick.bid());
        assertEquals(0, anchorSpread.compareTo(tickSpread));
    }

    @Test
    void carriesTheAnchorsSymbolAndCurrency() {
        Quote tick = RandomizerModel.next(ANCHOR, new BigDecimal("99.75"), WIDE_BOUNDS, 0.001, 0.0);

        assertEquals("AAPL", tick.symbol());
        assertEquals("USD", tick.currency());
    }

    @Test
    void rejectsBoundsWithLowAboveHigh() {
        try {
            new RandomizerModel.Bounds(new BigDecimal("100"), new BigDecimal("50"));
            throw new AssertionError("expected IllegalArgumentException");
        } catch (IllegalArgumentException expected) {
            // expected
        }
    }
}
