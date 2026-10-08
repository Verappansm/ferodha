package com.trade.signal;

import com.trade.signal.SignalCalculator.Direction;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SignalCalculatorTest {

    /** Closes rising (or falling) by {@code step} a day, with a small zig-zag so RSI is defined. */
    private static List<BigDecimal> trend(int days, double start, double step, double wiggle) {
        List<BigDecimal> closes = new ArrayList<>();
        for (int i = 0; i < days; i++) {
            double zig = i % 2 == 0 ? wiggle : -wiggle;
            closes.add(BigDecimal.valueOf(start + step * i + zig));
        }
        return closes;
    }

    @Test
    @DisplayName("fewer than 50 closes is HOLD, saying why, with no averages invented")
    void notEnoughHistory() {
        SignalCalculator.Result r = SignalCalculator.evaluate(trend(30, 100, 1, 0.5));
        assertEquals(Direction.HOLD, r.direction());
        assertTrue(r.reason().startsWith("Not enough history"));
        assertNull(r.smaFast());
    }

    @Test
    @DisplayName("a steady gentle rise is a BUY: the fast average above the slow, RSI not overbought")
    void uptrendBuys() {
        SignalCalculator.Result r = SignalCalculator.evaluate(trend(60, 100, 0.2, 1.5));
        assertEquals(Direction.BUY, r.direction());
        assertTrue(r.smaFast().compareTo(r.smaSlow()) > 0);
        assertTrue(r.reason().contains("Uptrend"));
    }

    @Test
    @DisplayName("a steady gentle fall is a SELL")
    void downtrendSells() {
        SignalCalculator.Result r = SignalCalculator.evaluate(trend(60, 200, -0.2, 1.5));
        assertEquals(Direction.SELL, r.direction());
    }

    @Test
    @DisplayName("a rise with no down days is overbought, so HOLD rather than BUY")
    void overboughtHolds() {
        SignalCalculator.Result r = SignalCalculator.evaluate(trend(60, 100, 1, 0));
        assertEquals(Direction.HOLD, r.direction());
        assertEquals(0, r.rsi().compareTo(BigDecimal.valueOf(100)));
        assertTrue(r.reason().contains("overbought"));
    }

    @Test
    @DisplayName("the 20-day average is the mean of the last 20 closes")
    void smaIsTheMean() {
        List<BigDecimal> closes = new ArrayList<>();
        for (int i = 1; i <= 25; i++) {
            closes.add(BigDecimal.valueOf(i));
        }
        // last 20 are 6..25, mean 15.5
        assertEquals(0, SignalCalculator.sma(closes, 20).compareTo(new BigDecimal("15.5")));
    }
}
